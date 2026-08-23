"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { getDataStoreConfig } from "@/lib/settings";
import { findSellableBundle } from "@/lib/data-bundles/catalog";
import {
  agentIsSelling,
  findAgentSellableBundle,
  getAgentBySlug,
} from "@/lib/data-bundles/agents";
import { commissionOn } from "@/lib/data-bundles/agent-pricing";
import {
  NETWORKS,
  bundleLabel,
  networkLabel,
  phoneMatchesNetwork,
  toLocalGhPhone,
} from "@/lib/data-bundles/networks";
import {
  newAfaReference,
  newDataReference,
  settleAfaRegistration,
  settleDataOrder,
} from "@/lib/data-bundles/fulfillment";

/**
 * Public actions for the bundle storefront. Buying needs no account — a phone
 * number is the whole identity — so every one of these is reachable by anyone
 * and is rate-limited and re-priced server-side accordingly.
 */

/** Absolute origin of the current request, for Paystack callback URLs. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Best-effort client IP, for rate-limit buckets. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Buy a bundle
// ---------------------------------------------------------------------------

// The checkout form asks for two things and nothing else: the number to top up
// and (optionally) an email for the Paystack receipt. That number is also how
// the buyer is identified afterwards, so there is no separate "your number".
const buySchema = z.object({
  network: z.enum(NETWORKS),
  sizeGb: z.number().positive().max(1000),
  recipientPhone: z.string().min(9, "Enter the number to top up."),
  buyerEmail: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  /** Buy through an agent's storefront: their slug. Omitted on NikiMart's own store. */
  storeSlug: z.string().trim().max(40).optional(),
});

export type BuyBundleInput = z.infer<typeof buySchema>;

export type BuyBundleResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

export async function buyBundle(input: BuyBundleInput): Promise<BuyBundleResult> {
  const config = await getDataStoreConfig();
  if (!config.enabled) {
    return { ok: false, error: "The data bundle store is temporarily closed. Please try again later." };
  }

  const parsed = buySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const data = parsed.data;

  const recipientPhone = toLocalGhPhone(data.recipientPhone);
  if (!recipientPhone) {
    return { ok: false, error: "Enter a valid Ghana number for the recipient, e.g. 0241234567." };
  }
  if (!phoneMatchesNetwork(recipientPhone, data.network)) {
    return {
      ok: false,
      error: `${recipientPhone} is not a ${networkLabel(data.network)} number. Pick the right network, or check the number.`,
    };
  }

  // The number being topped up is also the buyer's contact — the form asks for
  // nothing more than that.
  const buyerPhone = recipientPhone;

  // One buyer shouldn't be able to spray orders — a burst of failed provider
  // calls costs real money upstream.
  const limit = rateLimit(`bundle:${buyerPhone}:${await clientIp()}`, 8, 10 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many orders from this number. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  // A sale through an agent's storefront is priced from *their* ladder, and
  // earns them the difference over what NikiMart charges them. Everything else
  // (payment, dispatch, delivery) is identical.
  const agent = data.storeSlug ? await getAgentBySlug(data.storeSlug) : null;
  if (data.storeSlug && (!agent || !agentIsSelling(agent))) {
    return { ok: false, error: "This store is not taking orders right now." };
  }

  // Re-price from the database — the browser only tells us which bundle, never
  // what it costs.
  const bundle = agent
    ? await findAgentSellableBundle(agent.id, data.network, data.sizeGb)
    : await findSellableBundle(data.network, data.sizeGb);
  if (!bundle) {
    return { ok: false, error: "That bundle is no longer available. Please pick another size." };
  }

  // On an agent sale the cost basis is the agent price, and the commission is
  // whatever they charge above it. On NikiMart's own store there is neither.
  const agentCost = agent && "agentPrice" in bundle ? bundle.agentPrice : 0;
  const agentCommission = agent ? commissionOn(bundle.price, agentCost) : 0;
  const costPrice = "costPrice" in bundle ? bundle.costPrice : 0;

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const buyerEmail = data.buyerEmail?.trim() || null;

  const collectPayment = isPaymentConfigured();

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newDataReference();
    try {
      const order = await prisma.dataOrder.create({
        data: {
          reference,
          network: bundle.network,
          sizeGb: bundle.sizeGb,
          price: bundle.price,
          costPrice,
          recipientPhone,
          buyerPhone,
          buyerEmail,
          buyerName: null,
          status: "pending",
          paymentStatus: "unpaid",
          userId,
          agentId: agent?.id ?? null,
          source: agent ? "STOREFRONT" : "WEB",
          agentCost,
          agentCommission,
          commissionStatus: agent ? "pending" : "void",
        },
      });

      if (!collectPayment) {
        // No Paystack keys (local dev / preview): treat it as paid so the whole
        // flow stays exercisable end to end.
        after(async () => {
          await settleDataOrder(reference);
        });
        return { ok: true, reference };
      }

      try {
        const { authorizationUrl } = await initializeTransaction({
          // Paystack needs an email; buyers who don't give one get a stable
          // per-order placeholder rather than someone else's address.
          email: buyerEmail ?? `${buyerPhone}@data.nikimart.app`,
          amountPesewas: toPesewas(bundle.price),
          reference,
          callbackUrl: `${await requestOrigin()}${agent ? `/store/${agent.slug}/verify` : "/data-bundles/verify"}`,
          metadata: {
            kind: "data-bundle",
            dataOrderId: order.id,
            network: bundle.network,
            size: bundleLabel(bundle.sizeGb),
            recipientPhone,
            ...(agent ? { store: agent.slug, agentCode: agent.code } : {}),
          },
        });
        return { ok: true, reference, authorizationUrl };
      } catch (err) {
        // The order never became payable — drop it so it doesn't sit in the
        // admin as a phantom "awaiting payment" row.
        await prisma.dataOrder.delete({ where: { id: order.id } }).catch(() => {});
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
        };
      }
    } catch {
      // Reference collision — try another one.
      if (attempt === 4) {
        return { ok: false, error: "Could not place the order. Please try again." };
      }
    }
  }
  return { ok: false, error: "Could not place the order. Please try again." };
}

// ---------------------------------------------------------------------------
// AFA registration
// ---------------------------------------------------------------------------

const afaSchema = z.object({
  fullName: z.string().trim().min(3, "Enter the full name as it appears on the ID."),
  phoneNumber: z.string().min(9, "Enter the phone number to register."),
  idNumber: z.string().trim().min(5, "Enter the Ghana Card number, e.g. GHA-123456789-0."),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth."),
  town: z.string().trim().min(2, "Enter the town or city."),
  occupation: z.string().trim().min(2, "Enter the occupation."),
  /** Registered through an agent's storefront: their slug. */
  storeSlug: z.string().trim().max(40).optional(),
});

export type AfaInputForm = z.infer<typeof afaSchema>;
export type AfaResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

export async function registerAfa(input: AfaInputForm): Promise<AfaResult> {
  const config = await getDataStoreConfig();
  if (!config.enabled || !config.afaEnabled) {
    return { ok: false, error: "AFA registration is not available right now." };
  }

  const parsed = afaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const data = parsed.data;

  const phoneNumber = toLocalGhPhone(data.phoneNumber);
  if (!phoneNumber) {
    return { ok: false, error: "Enter a valid Ghana number, e.g. 0241234567." };
  }

  const dob = new Date(`${data.dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) {
    return { ok: false, error: "Enter a valid date of birth." };
  }

  const limit = rateLimit(`afa:${phoneNumber}:${await clientIp()}`, 4, 30 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many registrations from this number. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const session = await auth();
  const collectPayment = isPaymentConfigured();

  // An agent may charge their own AFA price; the difference over NikiMart's is
  // their commission, exactly as on a bundle.
  const agent = data.storeSlug ? await getAgentBySlug(data.storeSlug) : null;
  if (data.storeSlug && (!agent || !agentIsSelling(agent) || !agent.afaEnabled)) {
    return { ok: false, error: "This store is not taking AFA registrations right now." };
  }
  const price = agent && agent.afaPrice > 0 ? agent.afaPrice : config.afaPrice;
  const agentCommission = agent ? commissionOn(price, config.afaPrice) : 0;

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newAfaReference();
    try {
      const row = await prisma.afaRegistration.create({
        data: {
          reference,
          fullName: data.fullName,
          phoneNumber,
          idNumber: data.idNumber.toUpperCase(),
          dateOfBirth: data.dateOfBirth,
          town: data.town,
          occupation: data.occupation,
          price,
          userId: session?.user?.id ?? null,
          agentId: agent?.id ?? null,
          source: agent ? "STOREFRONT" : "WEB",
          agentCost: agent ? config.afaPrice : 0,
          agentCommission,
          commissionStatus: agent ? "pending" : "void",
        },
      });

      if (!collectPayment) {
        after(async () => {
          await settleAfaRegistration(reference);
        });
        return { ok: true, reference };
      }

      try {
        const { authorizationUrl } = await initializeTransaction({
          email: `${phoneNumber}@data.nikimart.app`,
          amountPesewas: toPesewas(price),
          reference,
          callbackUrl: `${await requestOrigin()}${agent ? `/store/${agent.slug}/verify` : "/data-bundles/verify"}`,
          metadata: {
            kind: "afa-registration",
            afaId: row.id,
            phoneNumber,
            ...(agent ? { store: agent.slug, agentCode: agent.code } : {}),
          },
        });
        return { ok: true, reference, authorizationUrl };
      } catch (err) {
        await prisma.afaRegistration.delete({ where: { id: row.id } }).catch(() => {});
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
        };
      }
    } catch {
      if (attempt === 4) {
        return { ok: false, error: "Could not submit the registration. Please try again." };
      }
    }
  }
  return { ok: false, error: "Could not submit the registration. Please try again." };
}
