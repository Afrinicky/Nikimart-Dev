"use server";

import { revalidatePath } from "next/cache";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import {
  reconcileDataOrder,
  reconcileMessage,
  settleOrderByHand,
} from "@/lib/data-bundles/payment-recovery";
import { confirmPaymentClaim, rejectPaymentClaim } from "@/lib/data-bundles/payment-claims";
import { reorderDataOrder } from "@/lib/data-bundles/fulfillment";

/**
 * What an admin can do about an order that reads "awaiting payment".
 *
 * Three moves, in the order they should be tried. Asking the gateway is free
 * and settles nearly all of them outright. A claim is somebody's evidence,
 * confirmed or turned down. Recording the payment by hand is the last resort,
 * and it writes down who recorded it — a bundle handed over on a person's word
 * should always say whose word it was.
 */

export interface PaymentActionResult {
  ok: boolean;
  message: string;
}

function refresh(): void {
  revalidatePath("/admin/data/orders");
  revalidatePath("/admin/data");
  revalidatePath("/admin/data/notifications");
}

/** Ask Paystack about this order again, and settle it if the money is there. */
export async function recheckOrderPaymentAdmin(reference: string): Promise<PaymentActionResult> {
  await requireDataAdminAction();
  const outcome = await reconcileDataOrder(String(reference ?? ""), { force: true });
  const message = reconcileMessage(outcome);
  const ok = outcome.state === "settled" || outcome.state === "already-paid";
  if (ok) refresh();
  return { ok, message };
}

/**
 * Record the payment on the admin's own word and send the bundle.
 *
 * Deliberately separate from the re-check above: this hands over a bundle the
 * gateway has not confirmed, so it is a decision rather than a lookup, and the
 * admin who made it is stamped on the order.
 */
export async function settleOrderPaymentAdmin(orderId: string): Promise<PaymentActionResult> {
  const admin = await requireDataAdminAction();
  const who = admin.name || admin.email || admin.id;
  const result = await settleOrderByHand(String(orderId ?? ""), who);
  if (result.ok) refresh();
  return result;
}

/** Confirm or turn down a buyer's claim. Confirming is what sends the bundle. */
export async function decidePaymentClaimAdmin(
  claimId: string,
  decision: "confirm" | "reject",
  reason: string,
): Promise<PaymentActionResult> {
  const admin = await requireDataAdminAction();
  const who = admin.name || admin.email || admin.id;

  const result =
    decision === "confirm"
      ? await confirmPaymentClaim(String(claimId ?? ""), who)
      : await rejectPaymentClaim(String(claimId ?? ""), who, String(reason ?? ""));

  if (result.ok) refresh();
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.error };
}

/**
 * Send this order to the provider again.
 *
 * One action, because from the console it is one decision: this bundle was
 * paid for and has not been delivered, so buy it. Whether the provider has
 * already given the order a reference of its own — which is the difference the
 * old pair of buttons exposed, and the reason the obvious one did not work on
 * a failed order — is worked out upstream in `reorderDataOrder`.
 *
 * It spends money, so the card asks before it gets here.
 */
export async function reorderDataOrderAdmin(orderId: string): Promise<PaymentActionResult> {
  await requireDataAdminAction();
  const result = await reorderDataOrder(String(orderId ?? ""));
  if (result.ok) refresh();
  return { ok: result.ok, message: result.message };
}
