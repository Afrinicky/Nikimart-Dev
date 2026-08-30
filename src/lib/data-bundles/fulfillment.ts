import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { DATA_REFERENCE_PREFIX, AFA_REFERENCE_PREFIX } from "@/lib/data-bundles/reference";
import { toPesewas } from "@/lib/payments";
import { sendSms, notify } from "@/lib/notifications";
import { siteUrl } from "@/lib/site";
import { callbackToken } from "@/lib/data-bundles/callback-token";
import { formatPrice } from "@/lib/format";
import {
  bundleLabel,
  mapProviderStatus,
  networkLabel,
  type DataOrderStatus,
  type Network,
} from "@/lib/data-bundles/networks";
import {
  createProviderAfa,
  createProviderOrder,
  getProviderOrder,
  isDataProviderConfigured,
} from "@/lib/data-bundles/provider";
import {
  creditAfaCommission,
  creditAgentCommission,
  voidAgentCommission,
} from "@/lib/data-bundles/agent-ledger";

/**
 * Payment settlement and provider dispatch for bundle purchases.
 *
 * Nothing here calls `revalidatePath`. Settlement runs from the Paystack
 * redirect, which is a *page render*, and Next throws on revalidation during
 * render — that crash is what put an error screen in front of buyers who had
 * already paid. Leaving it out costs nothing: every page that reads this data
 * is `force-dynamic`, so there is no cached copy to invalidate.
 *
 * The two halves are deliberately separate: money in (`settleDataOrder`) and
 * data out (`dispatchDataOrder`). Payment is settled with a guarded
 * `updateMany`, so the Paystack redirect and the Paystack webhook racing each
 * other still dispatch exactly once — and a dispatch that fails leaves a paid
 * order the admin can retry rather than a lost sale.
 */

// Re-exported so existing callers keep importing them from here. They are
// defined in lib/data-bundles/reference, which is pure — this module is
// server-only, and the public order tracker needs the same prefixes.
export {
  DATA_REFERENCE_PREFIX,
  AFA_REFERENCE_PREFIX,
  isDataReference,
  isAfaReference,
} from "@/lib/data-bundles/reference";

export function newDataReference(): string {
  return `${DATA_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}
export function newAfaReference(): string {
  return `${AFA_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

/**
 * The status callback we hand the provider with each order. Nothing to
 * configure — the token is derived from AUTH_SECRET (see callback-token.ts).
 */
function callbackUrl(reference: string): string | undefined {
  const token = callbackToken(reference);
  if (!token) return undefined; // no AUTH_SECRET → no callback we could trust
  const url = new URL("/api/data-bundles/webhook", siteUrl());
  url.searchParams.set("ref", reference);
  url.searchParams.set("token", token);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Bundle orders
// ---------------------------------------------------------------------------

/** Confirm the captured amount covers the order before settling it. */
export async function dataPaymentCovers(reference: string, amountPesewas: number): Promise<boolean> {
  const order = await prisma.dataOrder.findUnique({
    where: { reference },
    select: { price: true },
  });
  if (!order) return false;
  // One pesewa of tolerance absorbs rounding between our total and the
  // gateway's integer amount.
  return amountPesewas + 1 >= toPesewas(order.price);
}

/**
 * Mark a bundle order paid — idempotently — and dispatch it to the provider.
 * Returns true only for the caller that won the transition.
 */
export async function settleDataOrder(reference: string): Promise<boolean> {
  const flipped = await prisma.dataOrder.updateMany({
    where: { reference, paymentStatus: "unpaid" },
    data: { paymentStatus: "paid", status: "paid", paidAt: new Date() },
  });
  if (flipped.count === 0) return false; // already settled, or unknown reference

  const order = await prisma.dataOrder.findUnique({ where: { reference } });
  if (!order) return false;

  // Dispatch after the response is sent: the buyer shouldn't wait on the
  // provider, and a slow upstream must never stall the payment redirect.
  const id = order.id;
  after(async () => {
    await dispatchDataOrder(id);
  });

  return true;
}

export interface DispatchResult {
  ok: boolean;
  message: string;
}

/**
 * Send a paid order to the provider. Safe to call again on a failed order —
 * the guarded update means an order already handed over is never bought twice.
 */
export async function dispatchDataOrder(orderId: string): Promise<DispatchResult> {
  const order = await prisma.dataOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.paymentStatus !== "paid") {
    return { ok: false, message: "This order has not been paid for yet." };
  }
  if (order.providerOrderId) {
    return { ok: false, message: "This order has already been sent to the provider." };
  }

  if (!isDataProviderConfigured()) {
    await prisma.dataOrder.update({
      where: { id: orderId },
      data: {
        status: "paid",
        providerMessage: "Waiting for the data provider API key to be configured.",
      },
    });
    return { ok: false, message: "The data provider is not configured." };
  }

  // Claim the dispatch before calling out. If two admins hit "retry" at once,
  // only the one that moves the row out of its pre-dispatch state proceeds.
  const claimed = await prisma.dataOrder.updateMany({
    where: { id: orderId, providerOrderId: null, status: { in: ["paid", "failed"] } },
    data: { status: "processing", dispatchedAt: new Date() },
  });
  if (claimed.count === 0) {
    return { ok: false, message: "This order is already being processed." };
  }

  const res = await createProviderOrder({
    phone: order.recipientPhone,
    size: order.sizeGb,
    network: order.network as Network,
    callback: callbackUrl(order.reference),
  });

  if (!res.ok || !res.payload?.id) {
    await prisma.dataOrder.update({
      where: { id: orderId },
      data: { status: "failed", providerMessage: res.message.slice(0, 500) },
    });
    after(async () => {
      await notifyDataOrderFailed(orderId);
      await voidAgentCommission(orderId);
    });
    return { ok: false, message: res.message };
  }

  const status = mapProviderStatus(res.payload.status);
  await prisma.dataOrder.update({
    where: { id: orderId },
    data: {
      status,
      providerOrderId: res.payload.id,
      providerCode: res.payload.orderCode ?? null,
      providerStatus: res.payload.status ?? null,
      providerMessage: res.message.slice(0, 500),
      // The provider quotes upstream cost in pesewas — keep it for the margin
      // report, but never let it change what the buyer was charged.
      costPrice: typeof res.payload.price === "number" ? res.payload.price / 100 : order.costPrice,
      completedAt: status === "completed" ? new Date() : null,
    },
  });

  after(async () => {
    await notifyDataOrderDispatched(orderId);
    // A provider that completes on the spot still owes the selling agent their
    // commission — applyProviderStatus never runs for that order.
    if (status === "completed") await creditAgentCommission(orderId);
  });
  return { ok: true, message: res.message };
}

/**
 * Apply a provider status (from the callback or an admin refresh) to an order.
 * Terminal states are sticky: a completed order never walks backwards.
 */
export async function applyProviderStatus(
  orderId: string,
  providerStatus: string | null | undefined,
  message?: string,
): Promise<DataOrderStatus | null> {
  const order = await prisma.dataOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) return null;
  if (order.status === "completed" || order.status === "refunded") {
    return order.status as DataOrderStatus;
  }

  const next = mapProviderStatus(providerStatus);
  await prisma.dataOrder.update({
    where: { id: orderId },
    data: {
      status: next,
      providerStatus: providerStatus ?? null,
      ...(message ? { providerMessage: message.slice(0, 500) } : {}),
      completedAt: next === "completed" ? new Date() : null,
    },
  });

  if (next === "completed") {
    after(async () => {
      await notifyDataOrderCompleted(orderId);
      // Commission is earned on delivery, never on payment — a bundle that
      // never lands is a sale the agent was never owed for.
      await creditAgentCommission(orderId);
    });
  } else if (next === "failed") {
    after(async () => {
      await notifyDataOrderFailed(orderId);
      await voidAgentCommission(orderId);
    });
  }
  return next;
}

/** Re-read an order from the provider and apply whatever it says. */
export async function refreshDataOrder(orderId: string): Promise<DispatchResult> {
  const order = await prisma.dataOrder.findUnique({
    where: { id: orderId },
    select: { providerOrderId: true },
  });
  if (!order?.providerOrderId) {
    return { ok: false, message: "This order hasn't been sent to the provider yet." };
  }
  const res = await getProviderOrder(order.providerOrderId);
  if (!res.ok) return { ok: false, message: res.message };
  await applyProviderStatus(orderId, res.payload?.status, res.message);
  return { ok: true, message: res.message };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function orderForNotice(orderId: string) {
  return prisma.dataOrder.findUnique({ where: { id: orderId } });
}

/** Tell the buyer (and the recipient, when different) that data is on the way. */
export async function notifyDataOrderDispatched(orderId: string): Promise<void> {
  const o = await orderForNotice(orderId);
  if (!o) return;
  const size = bundleLabel(o.sizeGb);
  const net = networkLabel(o.network);
  const buyerText =
    `Nickimart Data: ${size} ${net} for ${o.recipientPhone} is on its way. ` +
    `Ref ${o.reference}. Track it at ${siteUrl()}/data-bundles/orders`;
  await notify({ phone: o.buyerPhone, email: o.buyerEmail }, {
    sms: buyerText,
    emailSubject: `Your ${size} ${net} bundle — ${o.reference}`,
  });
  if (o.recipientPhone !== o.buyerPhone) {
    await sendSms(o.recipientPhone, `Nickimart Data: ${size} ${net} is being credited to this number. Ref ${o.reference}.`);
  }
}

export async function notifyDataOrderCompleted(orderId: string): Promise<void> {
  const o = await orderForNotice(orderId);
  if (!o) return;
  const size = bundleLabel(o.sizeGb);
  const net = networkLabel(o.network);
  await notify({ phone: o.buyerPhone, email: o.buyerEmail }, {
    sms: `Nickimart Data: ${size} ${net} has been delivered to ${o.recipientPhone}. Ref ${o.reference}. Thank you!`,
    emailSubject: `Delivered — ${size} ${net} (${o.reference})`,
  });
}

export async function notifyDataOrderFailed(orderId: string): Promise<void> {
  const o = await orderForNotice(orderId);
  if (!o) return;
  const size = bundleLabel(o.sizeGb);
  const net = networkLabel(o.network);
  await notify({ phone: o.buyerPhone, email: o.buyerEmail }, {
    sms:
      `Nickimart Data: we could not deliver ${size} ${net} to ${o.recipientPhone} (ref ${o.reference}). ` +
      `Our team is on it — you will be credited or refunded ${formatPrice(o.price)}.`,
    emailSubject: `Action needed — ${o.reference}`,
  });
}

// ---------------------------------------------------------------------------
// AFA registrations
// ---------------------------------------------------------------------------

export async function afaPaymentCovers(reference: string, amountPesewas: number): Promise<boolean> {
  const row = await prisma.afaRegistration.findUnique({
    where: { reference },
    select: { price: true },
  });
  if (!row) return false;
  return amountPesewas + 1 >= toPesewas(row.price);
}

/** Mark an AFA registration paid — idempotently — and submit it upstream. */
export async function settleAfaRegistration(reference: string): Promise<boolean> {
  const flipped = await prisma.afaRegistration.updateMany({
    where: { reference, paymentStatus: "unpaid" },
    data: { paymentStatus: "paid", status: "paid", paidAt: new Date() },
  });
  if (flipped.count === 0) return false;

  const row = await prisma.afaRegistration.findUnique({ where: { reference } });
  if (!row) return false;

  const id = row.id;
  after(async () => {
    await dispatchAfaRegistration(id);
  });
  return true;
}

export async function dispatchAfaRegistration(id: string): Promise<DispatchResult> {
  const row = await prisma.afaRegistration.findUnique({ where: { id } });
  if (!row) return { ok: false, message: "Registration not found." };
  if (row.paymentStatus !== "paid") return { ok: false, message: "Not paid yet." };
  if (row.providerId) return { ok: false, message: "Already submitted." };

  if (!isDataProviderConfigured()) {
    await prisma.afaRegistration.update({
      where: { id },
      data: { providerMessage: "Waiting for the data provider API key to be configured." },
    });
    return { ok: false, message: "The data provider is not configured." };
  }

  const claimed = await prisma.afaRegistration.updateMany({
    where: { id, providerId: null, status: { in: ["paid", "failed"] } },
    data: { status: "processing", dispatchedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, message: "This registration is already being processed." };

  const res = await createProviderAfa({
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    idNumber: row.idNumber,
    dateOfBirth: row.dateOfBirth,
    town: row.town,
    occupation: row.occupation,
    callback: callbackUrl(row.reference),
  });

  if (!res.ok || !res.payload?.id) {
    await prisma.afaRegistration.update({
      where: { id },
      data: { status: "failed", providerMessage: res.message.slice(0, 500) },
    });
    return { ok: false, message: res.message };
  }

  const status = mapProviderStatus(res.payload.status);
  await prisma.afaRegistration.update({
    where: { id },
    data: {
      status,
      providerId: res.payload.id,
      providerStatus: res.payload.status ?? null,
      providerMessage: res.message.slice(0, 500),
      completedAt: status === "completed" ? new Date() : null,
    },
  });
  await sendSms(
    row.phoneNumber,
    `Nickimart Data: your AFA registration (ref ${row.reference}) has been submitted. We'll text you once it's approved.`,
  );
  return { ok: true, message: res.message };
}

/** Apply a provider status to an AFA registration (callback or admin refresh). */
export async function applyAfaProviderStatus(
  id: string,
  providerStatus: string | null | undefined,
  message?: string,
): Promise<void> {
  const row = await prisma.afaRegistration.findUnique({ where: { id }, select: { status: true } });
  if (!row || row.status === "completed") return;
  const next = mapProviderStatus(providerStatus);
  await prisma.afaRegistration.update({
    where: { id },
    data: {
      status: next,
      providerStatus: providerStatus ?? null,
      ...(message ? { providerMessage: message.slice(0, 500) } : {}),
      completedAt: next === "completed" ? new Date() : null,
    },
  });

  if (next === "completed") {
    after(async () => {
      await creditAfaCommission(id);
    });
  }
}
