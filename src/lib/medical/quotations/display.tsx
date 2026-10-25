import { makeStatus } from "@/components/medical/console/StatusBadge";

/**
 * The two status vocabularies on the quotation side.
 *
 * Two, because a request and a quotation are different records with different
 * lives: a request is the question and a quotation is one of the answers, and
 * one request can carry several versions of an answer. A shared vocabulary
 * would have to be vague enough to describe both, which is how a queue ends up
 * with a column nobody can act on.
 *
 * Tones map to whose move it is, not to how the news feels: `warn` is waiting
 * on us, `progress` is waiting on them, `good` is settled.
 */
export const requestStatus = makeStatus({
  NEW: { label: "New", tone: "warn" },
  UNDER_REVIEW: { label: "Under review", tone: "warn" },
  AWAITING_SUPPLIER: { label: "Awaiting supplier", tone: "progress" },
  DRAFTING: { label: "Being priced", tone: "warn" },
  SENT: { label: "Quotation sent", tone: "progress" },
  REVISION_REQUESTED: { label: "Revision asked for", tone: "warn" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  EXPIRED: { label: "Lapsed", tone: "neutral" },
  CONVERTED: { label: "Ordered", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const quotationStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  ISSUED: { label: "Issued", tone: "warn" },
  SENT: { label: "Sent", tone: "progress" },
  VIEWED: { label: "Read by customer", tone: "progress" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  EXPIRED: { label: "Lapsed", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  CONVERTED: { label: "Ordered", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

/** Where a request came from, in words rather than in capitals. */
export const REQUEST_SOURCES: Record<string, string> = {
  STOREFRONT: "Storefront",
  PHONE: "Telephone",
  EMAIL: "Email",
  WALK_IN: "Walk-in",
  REDISTRIBUTOR: "Redistributor",
};

/** The timeline's own vocabulary. */
export const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  STATUS_CHANGED: "Status changed",
  DRAFTED: "Drafted",
  ISSUED: "Issued",
  SENT: "Sent",
  VIEWED: "Read by customer",
  REVISED: "Revised",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Lapsed",
  CONVERTED: "Converted",
  NOTE: "Note",
  REMINDER_SENT: "Reminder sent",
};
