"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, type SessionUser } from "@/lib/session";
import { getAgentProgramConfig, getDataStoreConfig } from "@/lib/settings";
import { callbackOrigin } from "@/lib/site";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { newDataReference, settleDataOrder } from "@/lib/data-bundles/fulfillment";
import { bundleLabel, networkLabel, NETWORKS } from "@/lib/data-bundles/networks";
import { checkRecipient, parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { InsufficientBalanceError, postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import {
  getAgentBundleRows,
  getAgentForUser,
  getAgentWallet,
  normaliseSlug,
  round2,
  slugProblem,
  type AgentAccount,
} from "@/lib/data-bundles/agents";
import { maxWithdrawal, priceAtMarkup } from "@/lib/data-bundles/agent-pricing";

/**
 * Everything an agent can do to their own account: rename their store, set
 * their prices, and ask for their commission on MoMo.
 *
 * Every action re-reads the agent from the signed-in user rather than trusting
 * an id from the browser, so one agent can never touch another's store.
 *
 * Nothing here creates an agent. Accounts are minted only by an admin
 * approving an application (see agent-application-actions.ts) — a store slug
 * is a public URL under NikiMart's own domain, so NikiMart chooses who gets
 * one. Every export of a "use server" module is a potential public endpoint,
 * so a self-signup action left lying about here would be a way around that
 * gate whether or not anything still called it.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** The caller's agent account, or an error result to hand straight back. */
type CurrentAgent =
  | { agent: AgentAccount; user: SessionUser; error: null }
  | { agent: null; user: SessionUser; error: string };

async function currentAgent(): Promise<CurrentAgent> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { agent: null, user, error: "You don't have an agent account yet." };
  if (agent.status !== "active") {
    return { agent: null, user, error: "Your agent account is suspended. Please contact support." };
  }
  return { agent, user, error: null };
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

const storeSchema = z.object({
  storeName: z.string().trim().min(2, "Give your store a name.").max(60),
  slug: z.string().trim().min(3, "Choose a store link."),
  storeTagline: z.string().trim().max(120).optional(),
  storeAbout: z.string().trim().max(600).optional(),
  supportPhone: z.string().trim().optional(),
  supportWhatsapp: z.string().trim().optional(),
  whatsappGroup: z.string().trim().max(200).optional(),
});

export async function updateAgentStore(input: z.infer<typeof storeSchema>): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const slug = normaliseSlug(data.slug);
  const problem = slugProblem(slug);
  if (problem) return { ok: false, error: problem };

  if (slug !== agent.slug) {
    const taken = await prisma.dataAgent.findUnique({ where: { slug }, select: { id: true } });
    if (taken) return { ok: false, error: `“${slug}” is already taken. Try another store link.` };
  }

  // Both are optional; if given, they have to be real Ghana numbers.
  let support = "";
  if (data.supportPhone) {
    const parsed = parseGhPhone(data.supportPhone);
    if (!parsed.ok) return { ok: false, error: `Support number: ${parsed.message}` };
    support = parsed.local;
  }
  let whatsapp = "";
  if (data.supportWhatsapp) {
    const parsed = parseGhPhone(data.supportWhatsapp);
    if (!parsed.ok) return { ok: false, error: `WhatsApp number: ${parsed.message}` };
    whatsapp = parsed.local;
  }

  const group = data.whatsappGroup?.trim() ?? "";
  if (group && !/^https?:\/\//i.test(group)) {
    return { ok: false, error: "The WhatsApp group link should start with https://" };
  }

  await prisma.dataAgent.update({
    where: { id: agent.id },
    data: {
      storeName: data.storeName,
      slug,
      storeTagline: data.storeTagline?.trim() ?? "",
      storeAbout: data.storeAbout?.trim() ?? "",
      supportPhone: support,
      supportWhatsapp: whatsapp,
      whatsappGroup: group,
    },
  });

  revalidatePath("/agent/store");
  revalidatePath(`/store/${slug}`);
  return { ok: true, message: "Store details saved." };
}

/** Open or close the storefront to customers. */
export async function setStoreOpen(open: boolean): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };
  await prisma.dataAgent.update({ where: { id: agent.id }, data: { storeOpen: open } });
  revalidatePath("/agent/store");
  revalidatePath(`/store/${agent.slug}`);
  return { ok: true, message: open ? "Your store is open." : "Your store is closed to customers." };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const priceSchema = z.object({
  network: z.enum(NETWORKS),
  sizeGb: z.number().positive().max(1000),
  price: z.number().min(0).max(100000),
});

/**
 * Set what this agent charges for one bundle. The floor is the agent price —
 * selling below cost would mean NikiMart funding the agent's discount.
 */
export async function setAgentPrice(input: z.infer<typeof priceSchema>): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid price." };
  }
  const data = parsed.data;

  const rows = await getAgentBundleRows(agent.id);
  const row = rows.find((r) => r.network === data.network && r.sizeGb === data.sizeGb);
  if (!row) return { ok: false, error: "That bundle is not available to resell." };

  const price = round2(data.price);
  if (price < row.agentPrice) {
    return {
      ok: false,
      error: `Your price can't be below your cost of GH₵${row.agentPrice.toFixed(2)}.`,
    };
  }

  await prisma.dataAgentPrice.upsert({
    where: {
      agentId_network_sizeGb: { agentId: agent.id, network: data.network, sizeGb: data.sizeGb },
    },
    create: { agentId: agent.id, network: data.network, sizeGb: data.sizeGb, price },
    update: { price },
  });

  revalidatePath("/agent/store");
  revalidatePath(`/store/${agent.slug}`);
  return { ok: true, message: "Price updated." };
}

/** Show or hide one bundle in this agent's store. */
export async function setAgentPriceActive(input: {
  network: string;
  sizeGb: number;
  isActive: boolean;
}): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const network = NETWORKS.find((n) => n === input.network);
  if (!network) return { ok: false, error: "Unknown network." };

  const rows = await getAgentBundleRows(agent.id);
  const row = rows.find((r) => r.network === network && r.sizeGb === input.sizeGb);
  if (!row) return { ok: false, error: "That bundle is not available to resell." };

  await prisma.dataAgentPrice.upsert({
    where: { agentId_network_sizeGb: { agentId: agent.id, network, sizeGb: input.sizeGb } },
    create: { agentId: agent.id, network, sizeGb: input.sizeGb, price: row.price, isActive: input.isActive },
    update: { isActive: input.isActive },
  });

  revalidatePath("/agent/store");
  revalidatePath(`/store/${agent.slug}`);
  return { ok: true, message: input.isActive ? "Bundle is on sale." : "Bundle hidden from your store." };
}

/**
 * Re-price everything at once: retail = agent price + `percent`%. The quickest
 * way for a new agent to get a full ladder live.
 */
export async function applyBulkMarkup(percent: number): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  if (!Number.isFinite(percent) || percent < 0 || percent > 200) {
    return { ok: false, error: "Enter a markup between 0 and 200%." };
  }

  const rows = await getAgentBundleRows(agent.id);
  if (rows.length === 0) return { ok: false, error: "There are no bundles to price yet." };

  for (const row of rows) {
    const price = priceAtMarkup(row.agentPrice, percent);
    await prisma.dataAgentPrice.upsert({
      where: {
        agentId_network_sizeGb: { agentId: agent.id, network: row.network, sizeGb: row.sizeGb },
      },
      create: { agentId: agent.id, network: row.network, sizeGb: row.sizeGb, price },
      update: { price },
    });
  }

  revalidatePath("/agent/store");
  revalidatePath(`/store/${agent.slug}`);
  return { ok: true, message: `All ${rows.length} bundles re-priced at +${percent}%.` };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

const withdrawSchema = z.object({
  amount: z.number().positive("Enter the amount to withdraw."),
  momoPhone: z.string().min(9, "Enter the MoMo number to pay."),
  momoName: z.string().trim().min(3, "Enter the name on the MoMo account."),
  momoNetwork: z.enum(["MTN", "TELECEL", "AIRTELTIGO"]),
});

/**
 * Ask for commission on MoMo. The money leaves the balance immediately (so it
 * can't be spent twice while an admin works through the queue) and comes back
 * automatically if the request is rejected.
 */
export async function requestWithdrawal(input: z.infer<typeof withdrawSchema>): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;
  const config = await getAgentProgramConfig();

  const parsedMomo = parseGhPhone(data.momoPhone);
  if (!parsedMomo.ok) return { ok: false, error: `MoMo number: ${parsedMomo.message}` };
  const momoPhone = parsedMomo.local;

  const amount = round2(data.amount);
  if (amount < config.minWithdrawal) {
    return { ok: false, error: `The smallest withdrawal is GH₵${config.minWithdrawal.toFixed(2)}.` };
  }

  const limit = await rateLimit(`agent-withdraw:${agent.id}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return { ok: false, error: `Too many requests. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const wallet = await getAgentWallet(agent);
  const ceiling = maxWithdrawal(wallet.balance, config.withdrawalFee);
  if (amount > ceiling) {
    return {
      ok: false,
      error:
        ceiling <= 0
          ? "You have nothing available to withdraw yet."
          : `You can withdraw up to GH₵${ceiling.toFixed(2)} right now${config.withdrawalFee > 0 ? ` (a GH₵${config.withdrawalFee.toFixed(2)} fee applies)` : ""}.`,
    };
  }
  const total = round2(amount + config.withdrawalFee);

  // The check above is for the error message. The balance is re-tested inside
  // the debit itself, because two requests submitted at the same moment would
  // otherwise both read the same balance, both pass, and both be paid.
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.dataAgentWithdrawal.create({
        data: {
          agentId: agent.id,
          amount,
          fee: config.withdrawalFee,
          momoPhone,
          momoName: data.momoName,
          momoNetwork: data.momoNetwork,
        },
      });
      await postLedgerEntry(
        {
          agentId: agent.id,
          type: "WITHDRAWAL",
          amount: -total,
          requireBalance: total,
          narration: `Withdrawal to ${momoPhone} (${data.momoNetwork})${config.withdrawalFee > 0 ? ` — includes GH₵${config.withdrawalFee.toFixed(2)} fee` : ""}`,
          reference: row.id,
        },
        tx,
      );
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return {
        ok: false,
        error: "Your balance changed while that was going through. Check your wallet and try again.",
      };
    }
    return { ok: false, error: "Could not request that withdrawal. Please try again." };
  }

  revalidatePath("/agent/wallet");
  revalidatePath("/agent/store");
  return { ok: true, message: "Withdrawal requested. We'll send it to your MoMo shortly." };
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

const callbackSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name."),
  phone: z.string().min(9, "Enter the number to call you on."),
  language: z.string().trim().max(40).optional(),
  message: z.string().trim().min(5, "Tell us what you need help with."),
});

export async function requestCallback(input: z.infer<typeof callbackSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);

  const parsed = callbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const parsedPhone = parseGhPhone(data.phone);
  if (!parsedPhone.ok) return { ok: false, error: parsedPhone.message };
  const phone = parsedPhone.local;

  const limit = await rateLimit(`agent-callback:${user.id}`, 3, 60 * 60_000);
  if (!limit.ok) {
    return { ok: false, error: `You've already asked us to call. We'll be in touch shortly.` };
  }

  await prisma.dataSupportRequest.create({
    data: {
      agentId: agent?.id ?? null,
      fullName: data.fullName,
      phone,
      language: data.language?.trim() || "English",
      message: data.message,
    },
  });

  return { ok: true, message: "Thanks — we'll call you back shortly." };
}

// ---------------------------------------------------------------------------
// AFA pricing
// ---------------------------------------------------------------------------

const afaPriceSchema = z.object({
  price: z.number().min(0).max(100000),
  available: z.boolean(),
});

/**
 * Set what the agent charges for an AFA registration. As with bundles, the
 * floor is NikiMart's own price — anything above it is their commission.
 */
export async function setAgentAfaPrice(input: z.infer<typeof afaPriceSchema>): Promise<ActionResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const parsed = afaPriceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid price." };

  const store = await getDataStoreConfig();
  const price = round2(parsed.data.price);
  if (price > 0 && price < store.afaPrice) {
    return { ok: false, error: `Your AFA price can't be below GH₵${store.afaPrice.toFixed(2)}.` };
  }

  await prisma.dataAgent.update({
    where: { id: agent.id },
    data: { afaPrice: price, afaEnabled: parsed.data.available },
  });

  revalidatePath("/agent/store");
  revalidatePath(`/store/${agent.slug}`);
  return { ok: true, message: "AFA pricing saved." };
}

// ---------------------------------------------------------------------------
// The agent's own Data Topup
// ---------------------------------------------------------------------------

const topupSchema = z.object({
  network: z.enum(NETWORKS),
  sizeGb: z.number().positive().max(1000),
  recipientPhone: z.string().min(9, "Enter the number to top up."),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
});

export type AgentTopupResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

/**
 * The agent buying for a walk-in customer from their own dashboard.
 *
 * They pay their agent price — the wholesale rate — through Paystack, exactly
 * like any other buyer. No wallet is stocked and nothing is fronted: the money
 * is collected before the bundle is bought upstream. Whatever the agent charged
 * their customer in cash is between them and the customer, so there is no
 * commission on this route.
 */
export async function agentTopup(input: z.infer<typeof topupSchema>): Promise<AgentTopupResult> {
  const { agent, error } = await currentAgent();
  if (!agent) return { ok: false, error };

  const parsed = topupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const recipient = checkRecipient(data.recipientPhone, data.network, networkLabel(data.network));
  if (!recipient.ok) return { ok: false, error: recipient.message };
  const recipientPhone = recipient.local;

  const limit = await rateLimit(`agent-topup:${agent.id}`, 40, 10 * 60_000);
  if (!limit.ok) {
    return { ok: false, error: `Too many orders. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const rows = await getAgentBundleRows(agent.id);
  const row = rows.find((r) => r.network === data.network && r.sizeGb === data.sizeGb);
  if (!row) return { ok: false, error: "That bundle is not available right now." };

  const collectPayment = isPaymentConfigured();
  const email = data.email?.trim() || null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newDataReference();
    try {
      const order = await prisma.dataOrder.create({
        data: {
          reference,
          network: row.network,
          sizeGb: row.sizeGb,
          // The agent pays their wholesale rate.
          price: row.agentPrice,
          costPrice: 0,
          recipientPhone,
          buyerPhone: agent.supportPhone || recipientPhone,
          buyerEmail: email,
          buyerName: agent.storeName,
          status: "pending",
          paymentStatus: "unpaid",
          agentId: agent.id,
          source: "AGENT",
          agentCost: row.agentPrice,
          agentCommission: 0,
          commissionStatus: "void",
        },
      });

      if (!collectPayment) {
        after(async () => {
          await settleDataOrder(reference);
        });
        return { ok: true, reference };
      }

      try {
        const { authorizationUrl } = await initializeTransaction({
          email: email ?? `${recipientPhone}@data.nikimart.app`,
          amountPesewas: toPesewas(row.agentPrice),
          reference,
          callbackUrl: `${callbackOrigin()}/agent/verify`,
          metadata: {
            kind: "data-bundle",
            dataOrderId: order.id,
            network: row.network,
            size: bundleLabel(row.sizeGb),
            recipientPhone,
            agentCode: agent.code,
          },
        });
        return { ok: true, reference, authorizationUrl };
      } catch (err) {
        await prisma.dataOrder.delete({ where: { id: order.id } }).catch(() => {});
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
        };
      }
    } catch {
      if (attempt === 4) return { ok: false, error: "Could not place the order. Please try again." };
    }
  }
  return { ok: false, error: "Could not place the order. Please try again." };
}
