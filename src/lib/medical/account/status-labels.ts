import type { QuotationStatus, RequestStatus } from "../quotations/status.ts";

/**
 * The same facts, in the words a customer uses.
 *
 * The console's vocabulary is written for the people working the queue:
 * "Being priced", "Read by customer", "Issued". Those are true and they are
 * not what a hospital's procurement officer wants to read about their own
 * request — "Read by customer" told to the customer is nonsense, and "Issued"
 * does not say whether there is anything for them to do.
 *
 * So there are two vocabularies over one set of statuses, and a test asserts
 * this one covers every status the other can produce. A status with no entry
 * here would fall through to SCREAMING_SNAKE on a customer's screen.
 *
 * Tone, as everywhere in this system, says whose move it is rather than how
 * the news feels: `warn` is waiting on us, `progress` is with them, `good` is
 * settled. Colour is never the only signal — the word always carries it too.
 */

export type LabelTone = "neutral" | "progress" | "good" | "warn" | "bad" | "info";

export interface StatusLabel {
  label: string;
  tone: LabelTone;
  /** One line under the badge, where the status alone does not say enough. */
  note?: string;
}

export const REQUEST_LABELS: Record<RequestStatus, StatusLabel> = {
  NEW: { label: "Received", tone: "progress", note: "We have it. Pricing starts from here." },
  UNDER_REVIEW: { label: "Being reviewed", tone: "progress" },
  AWAITING_SUPPLIER: {
    label: "Checking with suppliers",
    tone: "progress",
    note: "Some lines need a price confirmed before we can quote.",
  },
  DRAFTING: { label: "Being priced", tone: "progress" },
  SENT: { label: "Quotation sent", tone: "warn", note: "Yours to review." },
  REVISION_REQUESTED: { label: "Revision requested", tone: "progress" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "neutral" },
  EXPIRED: { label: "Lapsed", tone: "neutral", note: "Ask again and we will re-price it." },
  CONVERTED: { label: "Ordered", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const QUOTATION_LABELS: Record<QuotationStatus, StatusLabel> = {
  // A draft is the business's working copy. A customer should never be shown
  // one — the account queries exclude them — but the entry exists so that a
  // row which somehow reaches a screen still reads as words.
  DRAFT: { label: "Being prepared", tone: "neutral" },
  ISSUED: { label: "Ready for you", tone: "warn" },
  SENT: { label: "Sent to you", tone: "warn" },
  VIEWED: { label: "Sent to you", tone: "warn" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "neutral" },
  EXPIRED: { label: "Lapsed", tone: "neutral" },
  SUPERSEDED: { label: "Replaced", tone: "neutral", note: "A newer version of this quotation exists." },
  CONVERTED: { label: "Ordered", tone: "good" },
  CANCELLED: { label: "Withdrawn", tone: "neutral" },
};

export const ORDER_FULFILMENT_LABELS: Record<string, StatusLabel> = {
  PENDING: { label: "Placed", tone: "progress" },
  CONFIRMED: { label: "Confirmed", tone: "progress" },
  PROCESSING: { label: "Being prepared", tone: "progress" },
  PARTIALLY_DISPATCHED: { label: "Part dispatched", tone: "progress" },
  DISPATCHED: { label: "Dispatched", tone: "progress" },
  DELIVERED: { label: "Delivered", tone: "good" },
  COMPLETED: { label: "Completed", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const ORDER_PAYMENT_LABELS: Record<string, StatusLabel> = {
  UNPAID: { label: "Unpaid", tone: "warn" },
  DEPOSIT_PAID: { label: "Deposit paid", tone: "progress" },
  PARTIALLY_PAID: { label: "Part paid", tone: "progress" },
  PAID: { label: "Paid", tone: "good" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  WRITTEN_OFF: { label: "Written off", tone: "neutral" },
};
