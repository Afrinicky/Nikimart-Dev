"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { raisePaymentClaim, type ClaimResult } from "@/lib/data-bundles/payment-claims";
import { reconcileDataOrder, reconcileMessage } from "@/lib/data-bundles/payment-recovery";

/**
 * The buyer's two buttons on the tracker, both open to guests.
 *
 * Bundle checkout needs no account, so neither can these. What protects them
 * is that neither settles anything on a stranger's say-so: the re-check asks
 * Paystack and believes only Paystack, and a claim is a message to an admin
 * that holds the bundle until a person confirms it. Both are rate limited per
 * address, because the reference space must not be walkable.
 */

async function callerKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

/** "I paid — check again." Asks the gateway and settles if the money is there. */
export async function recheckOrderPayment(reference: string): Promise<ClaimResult> {
  const ip = await callerKey();
  const limit = await rateLimit(`data-recheck:${ip}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many checks. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const outcome = await reconcileDataOrder(String(reference ?? ""), { force: true });
  if (outcome.state === "settled" || outcome.state === "already-paid") {
    revalidatePath("/data-bundles/orders");
    return { ok: true, message: reconcileMessage(outcome) };
  }
  return { ok: false, error: reconcileMessage(outcome) };
}

/** "It left my wallet." Raises a claim for an admin to confirm. */
export async function claimOrderPayment(input: {
  reference: string;
  contact: string;
  note: string;
}): Promise<ClaimResult> {
  const ip = await callerKey();
  const limit = await rateLimit(`data-claim:${ip}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many claims from this device. Please try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const result = await raisePaymentClaim({
    reference: String(input?.reference ?? ""),
    contact: String(input?.contact ?? ""),
    note: String(input?.note ?? ""),
  });
  if (result.ok) revalidatePath("/data-bundles/orders");
  return result;
}
