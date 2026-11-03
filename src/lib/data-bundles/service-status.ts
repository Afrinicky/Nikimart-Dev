/**
 * Where a service order has got to.
 *
 * Its own small module because these labels are read on both sides of the
 * client boundary — the admin's queue, an agent's sales table and the public
 * tracker — and a server-only module cannot cross it.
 *
 * Six states rather than the bundle's seven. A registration is worked by hand,
 * so there is nothing to queue and nothing a provider can fail; what a bundle
 * calls "failed" is here a thing a person decided, which is "cancelled".
 */
export const SERVICE_STATUSES = [
  "pending",
  "paid",
  "processing",
  "completed",
  "cancelled",
  "refunded",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export function isServiceStatus(value: unknown): value is ServiceStatus {
  return typeof value === "string" && (SERVICE_STATUSES as readonly string[]).includes(value);
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  processing: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const SERVICE_STATUS_TONES: Record<ServiceStatus, string> = {
  pending: "bg-niki-ink/5 text-niki-ink/60 ring-1 ring-niki-edge-strong",
  paid: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  processing: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  completed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  cancelled: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
  refunded: "bg-niki-ink/5 text-niki-ink/55 ring-1 ring-niki-edge-strong",
};

/** What to tell somebody standing on this status. */
export const SERVICE_STATUS_NOTE: Record<ServiceStatus, string> = {
  pending:
    "We haven't had confirmation of payment for this application. Nothing starts until it clears.",
  paid: "Payment received. Attach the documents below and we'll begin.",
  processing: "Your application is being worked on. We'll be in touch if anything else is needed.",
  completed: "Done. We'll have contacted you about collection or delivery.",
  cancelled: "This application was cancelled. Contact us with the reference below.",
  refunded: "This application was refunded. The money is on its way back to where it was paid from.",
};
