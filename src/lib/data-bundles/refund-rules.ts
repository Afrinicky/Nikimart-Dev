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
 * it has already been paid back. Everything else is a paid-for order with no
 * data at the other end, whatever the provider last said about it — including
 * `paid` and `processing`, which were refundable by nothing at all before and
 * are exactly where a dispatch that could not start leaves an order.
 */
export const REFUNDABLE_STATUSES = [
  "pending",
  "paid",
  "queued",
  "processing",
  "failed",
] as const;

/** States where the provider might still be mid-delivery, so ask it first. */
export const LIVE_STATUSES = ["queued", "processing"] as const;

/**
 * The one state only an administrator may refund from.
 *
 * "Processing" is the provider actively working on the order — unlike
 * "queued", which is accepted and not started. Pulling the money back there
 * risks the bundle landing anyway, and then the customer has the data and the
 * refund both. An admin can see the provider's own message on the order and
 * judge it; an agent cannot, so for them it stays with support.
 */
export const ADMIN_ONLY_REFUND_STATUSES = ["processing"] as const;

export type RefundDestination = "WALLET" | "BUYER_MOMO";

export function canRefundOrder(status: string, byAdmin = true): boolean {
  if (!(REFUNDABLE_STATUSES as readonly string[]).includes(status)) return false;
  if (!byAdmin && (ADMIN_ONLY_REFUND_STATUSES as readonly string[]).includes(status)) {
    return false;
  }
  return true;
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
 * Refused while the order is still with them — that is a status to refresh,
 * not a second bundle to buy — and refused on anything delivered or refunded.
 */
export function canReorderOrder(status: string, paymentStatus: string): boolean {
  if (paymentStatus !== "paid") return false;
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
