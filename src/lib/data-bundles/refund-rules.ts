/**
 * Who may refund what, where the money is allowed to go, and which orders can
 * still be re-ordered or sent to another number.
 *
 * Pure module, no server imports, because the sheet in the browser and the
 * action on the server have to agree exactly. They did not before, and that is
 * the whole of the reported bug: the console offered "Cancel & Refund" on a
 * queued order and a different button — "Mark refunded" — on a failed one,
 * which flipped the status and moved no money at all. One set of rules, read
 * by both sides, is what stops a button promising something the server will
 * not do.
 *
 * Run the tests with: npm test
 */

/**
 * The states an order can still be refunded from.
 *
 * Not `completed`: a delivered bundle cannot be un-delivered. Not `refunded`:
 * it has already been paid back. And not `processing`: that is the provider
 * actively working on the order, and the provider offers no cancellation at
 * that point — only `queued`, which is accepted and not started, can be
 * pulled back upstream. Offering a refund there would be promising something
 * nobody can deliver, and risking the bundle landing anyway, which leaves the
 * customer with the data and the money both.
 *
 * What is left is every paid-for order with no data at the other end and
 * nothing in flight to disturb — `paid` and `pending` included, which were
 * refundable by nothing at all before and are exactly where a dispatch that
 * could not start leaves an order.
 */
export const REFUNDABLE_STATUSES = ["pending", "paid", "queued", "failed"] as const;

/**
 * States where the provider might still be mid-delivery, so ask it first.
 *
 * Only `queued` can also be refunded, but both are re-read before any action:
 * a status of ours is a memory of what the provider last said, and the one
 * minute it is out of date is the minute it matters.
 */
export const LIVE_STATUSES = ["queued", "processing"] as const;

export type RefundDestination = "WALLET" | "BUYER_MOMO";

export function canRefundOrder(status: string): boolean {
  return (REFUNDABLE_STATUSES as readonly string[]).includes(status);
}

export function isLiveWithProvider(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Sending the bundle to another number instead of refunding it.
 *
 * Only from queued or failed, and only once the money is in: a bundle nobody
 * has paid for is not ours to move, and one the provider is actively working
 * on would be delivered twice.
 */
export function canRecreditOrder(status: string, paymentStatus: string): boolean {
  return paymentStatus === "paid" && (status === "queued" || status === "failed");
}

/**
 * Buying the bundle from the provider again.
 *
 * Refused on anything delivered or refunded, and refused while the order is
 * genuinely with the provider — that is a status to refresh, not a second
 * bundle to buy.
 *
 * `processing` with no upstream reference is the exception, and it is not a
 * hypothetical one: `dispatchDataOrder` marks the row processing *before* it
 * calls out, so a call that never returned leaves an order reading processing
 * that the provider has never heard of. It cannot be cancelled (there is
 * nothing upstream to cancel) and it cannot be refreshed (there is no
 * reference to read), so re-ordering is the only way out of it.
 */
export function canReorderOrder(
  status: string,
  paymentStatus: string,
  hasProviderOrderId = false,
): boolean {
  if (paymentStatus !== "paid") return false;
  if (status === "processing") return !hasProviderOrderId;
  return status === "pending" || status === "paid" || status === "failed";
}

/**
 * Where a refund is allowed to land.
 *
 * Two rules, and both exist to keep a browser from deciding where Nickimart's
 * money goes. An agent refunding their own sale can only credit their own
 * wallet — they settle their customer themselves — and an order with no
 * selling agent has no wallet to credit at all, so the only refund it can have
 * is one somebody sends to the buyer.
 */
export function refundDestinationFor(input: {
  byAdmin: boolean;
  hasAgent: boolean;
  requested?: RefundDestination | null;
}): RefundDestination {
  if (!input.hasAgent) return "BUYER_MOMO";
  if (!input.byAdmin) return "WALLET";
  return input.requested === "BUYER_MOMO" ? "BUYER_MOMO" : "WALLET";
}

/** A Ghana mobile money number as ten digits starting 0, or null. */
export function normaliseMomoPhone(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return digits;
  // +233XXXXXXXXX and 233XXXXXXXXX are the same number written for a gateway.
  if (/^233\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}
