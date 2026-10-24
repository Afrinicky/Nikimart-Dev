import { makeStatus } from "@/components/medical/console/StatusBadge";

/** Status vocabularies for the selling side. */

export const customerPoStatus = makeStatus({
  RECEIVED: { label: "Received", tone: "warn" },
  UNDER_REVIEW: { label: "Under review", tone: "progress" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  PARTIALLY_ACCEPTED: { label: "Part accepted", tone: "good" },
  REJECTED: { label: "Rejected", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
});

/**
 * Fulfilment and payment are separate vocabularies because they are separate
 * facts. An order can be delivered and unpaid, or paid and not yet picked, and
 * a single status column would force one of those to be a lie.
 */
export const fulfilmentStatus = makeStatus({
  PENDING: { label: "Pending", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", tone: "progress" },
  PROCESSING: { label: "Processing", tone: "progress" },
  PARTIALLY_DISPATCHED: { label: "Part dispatched", tone: "warn" },
  DISPATCHED: { label: "Dispatched", tone: "progress" },
  DELIVERED: { label: "Delivered", tone: "good" },
  COMPLETED: { label: "Completed", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "bad" },
});

export const paymentStatus = makeStatus({
  UNPAID: { label: "Unpaid", tone: "warn" },
  DEPOSIT_PAID: { label: "Deposit paid", tone: "progress" },
  PARTIALLY_PAID: { label: "Part paid", tone: "progress" },
  PAID: { label: "Paid", tone: "good" },
  REFUNDED: { label: "Refunded", tone: "bad" },
  WRITTEN_OFF: { label: "Written off", tone: "neutral" },
});
