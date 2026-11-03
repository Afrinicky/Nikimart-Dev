"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { dataDb } from "@/lib/data-db";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { callbackOrigin, siteUrl } from "@/lib/site";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import { requireDataUser } from "@/lib/data-bundles/session";
import { agentIsSelling, getAgentForUser } from "@/lib/data-bundles/agents";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { findSellableVariant } from "@/lib/data-bundles/services";
import { findSpeed, servicePricing } from "@/lib/data-bundles/service-fields";
import { newServiceReference, settleServiceOrder } from "@/lib/data-bundles/fulfillment";

/**
 * Registering somebody else.
 *
 * Plenty of customers would rather hand the whole thing over: they bring their
 * documents to the shop, or send them on WhatsApp, and ask to be registered.
 * The form on the website is no use to that person — somebody else is doing
 * the typing — so this is the counter version of it.
 *
 * It is deliberately the smallest thing that works. An admin or an agent picks
 * the service, the variant and the speed, types who it is for, and gets back a
 * link. Everything else — the documents, the questions, the back and forth —
 * happens wherever it was already happening. The link is the only part that
 * has to come back through Nickimart, because that is where the money is, and
 * paying it is what turns the arrangement into an order like any other.
 *
 * Nothing here can be paid on somebody's behalf: the link opens the same
 * Paystack checkout the website uses, under the same reference, settled by the
 * same webhook.
 */

export type AssistState = {
  ok?: boolean;
  error?: string;
  /** The link to send the customer, on success. */
  link?: string;
  reference?: string;
};

const assistSchema = z.object({
  serviceSlug: z.string().trim().min(1, "Choose a service."),
  variantId: z.string().trim().min(1, "Choose an option."),
  speedKey: z.string().trim().max(40).default(""),
  customerName: z.string().trim().min(2, "Enter the customer's name.").max(120),
  customerPhone: z.string().trim().min(9, "Enter the customer's phone number."),
  customerEmail: z.string().trim().max(160).default(""),
  note: z.string().trim().max(500).default(""),
});

function readForm(fd: FormData) {
  return assistSchema.safeParse({
    serviceSlug: String(fd.get("serviceSlug") ?? ""),
    variantId: String(fd.get("variantId") ?? ""),
    speedKey: String(fd.get("speedKey") ?? ""),
    customerName: String(fd.get("customerName") ?? ""),
    customerPhone: String(fd.get("customerPhone") ?? ""),
    customerEmail: String(fd.get("customerEmail") ?? ""),
    note: String(fd.get("note") ?? ""),
  });
}

/** Where the customer goes to pay. Absolute, so it can be pasted anywhere. */
export async function servicePayLink(reference: string): Promise<string> {
  return `${siteUrl()}/data-bundles/services/pay/${encodeURIComponent(reference)}`;
}

/**
 * Register a customer and get back a link for them to pay.
 *
 * One action for both consoles. An admin registers at Nickimart's price and
 * nobody earns a commission; an agent registers at their own price and earns
 * the margin exactly as they would on a sale through their storefront. Who is
 * signed in decides which, so there is no way to ask for the other.
 */
export async function registerCustomerForService(
  _state: AssistState,
  fd: FormData,
): Promise<AssistState> {
  const user = await requireDataUser();

  const config = await getServicesConfig();
  if (!config.enabled) return { error: "Services are closed right now." };

  const parsed = readForm(fd);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const phone = parseGhPhone(data.customerPhone);
  if (!phone.ok) return { error: phone.message };

  // An agent registers on their own account; an admin on Nickimart's.
  const agent = user.role === "ADMIN" ? null : await getAgentForUser(user.id);
  if (user.role !== "ADMIN") {
    if (!agent) return { error: "Only an agent or an administrator can register a customer." };
    if (!agentIsSelling(agent) || !agent.servicesEnabled) {
      return { error: "Your store is not open for services right now." };
    }
  }

  // An admin at the counter may register for a service that is kept off the
  // public storefront; an agent may only sell what is on their own shelf.
  const sellable = await findSellableVariant(
    data.serviceSlug,
    data.variantId,
    agent?.id ?? null,
    agent === null,
  );
  if (!sellable) return { error: "That option is no longer available." };
  const { service, variant } = sellable;

  const speed = findSpeed(variant.speeds, data.speedKey);
  const money = servicePricing({
    sellPrice: variant.sellPrice,
    costPrice: variant.costPrice,
    speedFee: speed?.extraFee ?? 0,
  });
  if (money.price <= 0) return { error: "That option is not priced yet." };

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newServiceReference();
    try {
      await dataDb.dataServiceOrder.create({
        data: {
          reference,
          serviceId: service.id,
          serviceName: service.name,
          variantId: variant.id,
          variantName: variant.name,
          speedLabel: speed?.label ?? "",
          speedFee: speed?.extraFee ?? 0,
          turnaround: speed?.turnaround || variant.turnaround,
          price: money.price,
          agentCost: agent ? money.cost : 0,
          customerName: data.customerName,
          customerPhone: phone.local,
          customerEmail: data.customerEmail,
          // The details were taken off the website, so the form is empty by
          // design. The note is where whoever took them says what was agreed.
          answers: JSON.stringify(
            data.note ? [{ key: "note", label: "Taken by", value: data.note }] : [],
          ),
          adminNote: data.note,
          agentId: agent?.id ?? null,
          source: agent ? "AGENT" : "ADMIN",
          agentCommission: agent ? money.commission : 0,
          commissionStatus: agent ? "pending" : "void",
        },
      });

      revalidatePath("/admin/data/products/orders");
      revalidatePath("/agent/products");
      return { ok: true, reference, link: await servicePayLink(reference) };
    } catch {
      if (attempt === 4) return { error: "Could not create the order. Please try again." };
    }
  }
  return { error: "Could not create the order. Please try again." };
}

// ---------------------------------------------------------------------------
// Paying a link
// ---------------------------------------------------------------------------

export type PayLinkResult =
  | { ok: true; authorizationUrl?: string; reference: string }
  | { ok: false; error: string };

/**
 * Open Paystack for an order that is waiting to be paid.
 *
 * Public on purpose: the whole point of the link is that it reaches somebody
 * who has no account here. The reference is the only key, and it buys nothing
 * but the chance to pay a bill that already exists — an order that has been
 * paid, cancelled or refunded is refused, and the amount is re-read from the
 * order rather than taken from the request.
 */
export async function startServicePayment(rawReference: string): Promise<PayLinkResult> {
  const reference = rawReference.trim().toUpperCase();
  if (!reference) return { ok: false, error: "That payment link is not valid." };

  try {
    const order = await dataDb.dataServiceOrder.findUnique({
      where: { reference },
      select: {
        id: true,
        reference: true,
        price: true,
        serviceName: true,
        customerPhone: true,
        customerEmail: true,
        paymentStatus: true,
        status: true,
        agent: { select: { slug: true, code: true } },
      },
    });
    if (!order) return { ok: false, error: "We couldn't find that order." };
    if (order.paymentStatus === "paid") {
      return { ok: false, error: "This order has already been paid for." };
    }
    if (order.status === "cancelled" || order.status === "refunded") {
      return { ok: false, error: "This order is closed." };
    }

    if (!isPaymentConfigured("data")) {
      // No gateway configured — the same behaviour the storefront has, so a
      // test environment can still walk the whole flow through.
      after(async () => {
        await settleServiceOrder(order.reference);
      });
      return { ok: true, reference: order.reference };
    }

    const { authorizationUrl } = await initializeTransaction(
      {
        email: order.customerEmail || `${order.customerPhone}@data.nikimart.app`,
        amountPesewas: toPesewas(order.price),
        reference: order.reference,
        callbackUrl: `${callbackOrigin()}${
          order.agent ? `/store/${order.agent.slug}/verify` : "/data-bundles/verify"
        }`,
        metadata: {
          kind: "service-order",
          serviceOrderId: order.id,
          phoneNumber: order.customerPhone,
          ...(order.agent ? { store: order.agent.slug, agentCode: order.agent.code } : {}),
        },
      },
      "data",
    );
    return { ok: true, reference: order.reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}
