import { makeStatus } from "@/components/medical/console/StatusBadge";

/** Status vocabularies for the tender desk. Declared once, used everywhere. */

export const tenderStatus = makeStatus({
  IDENTIFIED: { label: "Identified", tone: "neutral" },
  PREPARING: { label: "Preparing", tone: "progress" },
  SUBMITTED: { label: "Submitted", tone: "progress" },
  UNDER_EVALUATION: { label: "Under evaluation", tone: "warn" },
  AWARDED: { label: "Awarded", tone: "good" },
  PARTIALLY_AWARDED: { label: "Part awarded", tone: "good" },
  NOT_AWARDED: { label: "Not awarded", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
});

export const itemOutcomeStatus = makeStatus({
  PENDING: { label: "Pending", tone: "neutral" },
  AWARDED: { label: "Awarded", tone: "good" },
  PARTIALLY_AWARDED: { label: "Part awarded", tone: "warn" },
  NOT_AWARDED: { label: "Not awarded", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const registerStatus = makeStatus({
  ACTIVE: { label: "Approved", tone: "good" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  EXHAUSTED: { label: "Fully drawn", tone: "warn" },
  SUSPENDED: { label: "Suspended", tone: "bad" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
});

export const submissionStatus = makeStatus({
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "progress" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "progress" },
  UNDER_EVALUATION: { label: "Under evaluation", tone: "warn" },
  CLOSED: { label: "Closed", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
});
