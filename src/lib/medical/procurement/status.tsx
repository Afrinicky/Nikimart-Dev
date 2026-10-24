import { makeStatus } from "@/components/medical/console/StatusBadge";

/**
 * The status vocabularies for the buying side.
 *
 * Declared once each so a purchase order reads the same words and the same
 * colour on the list, on the detail page and in an export. Tones map to what
 * the status means for the person looking: `progress` is in hand, `warn` is
 * waiting on somebody, `bad` needs a decision, `good` is done.
 */

export const purchaseOrderStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "progress" },
  CONFIRMED: { label: "Confirmed", tone: "progress" },
  PARTIALLY_RECEIVED: { label: "Part received", tone: "warn" },
  RECEIVED: { label: "Received", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const supplierInvoiceStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "warn" },
  PARTIALLY_PAID: { label: "Part paid", tone: "progress" },
  PAID: { label: "Paid", tone: "good" },
  DISPUTED: { label: "Disputed", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const discrepancyStatus = makeStatus({
  NONE: { label: "Matches", tone: "good" },
  QUANTITY: { label: "Quantity", tone: "bad" },
  PRICE: { label: "Price", tone: "bad" },
  TAX: { label: "Tax", tone: "bad" },
  CHARGES: { label: "Charges", tone: "bad" },
  MULTIPLE: { label: "Several", tone: "bad" },
  UNMATCHED: { label: "Not ordered", tone: "bad" },
});

export const sourcingStatus = makeStatus({
  OPEN: { label: "Open", tone: "warn" },
  QUOTING: { label: "Quoting", tone: "progress" },
  ORDERED: { label: "Ordered", tone: "progress" },
  PARTIALLY_RECEIVED: { label: "Part received", tone: "warn" },
  FULFILLED: { label: "Fulfilled", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const supplierQuoteStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  REQUESTED: { label: "Requested", tone: "warn" },
  RECEIVED: { label: "Received", tone: "good" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
});
