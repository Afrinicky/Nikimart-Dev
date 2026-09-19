/**
 * What kinds of notification there are, and how each one reads.
 *
 * Pure, because the same answer is needed in three places that cannot share a
 * server module: the page listing them, the bell in the browser, and the
 * filters between the two. A kind that reads "Withdrawals" on one screen and
 * "WITHDRAWAL" on another is the drift this exists to prevent.
 */

/** The things worth telling an admin about. */
export const NOTIFICATION_KINDS = {
  WITHDRAWAL: "Withdrawals",
  APPLICATION: "Applications",
  REGISTRATION: "Registrations",
  SUPPORT: "Support",
  SYSTEM: "System",
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const NOTIFICATION_KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  ...Object.entries(NOTIFICATION_KINDS).map(([value, label]) => ({ value, label })),
];

export const NOTIFICATION_READ_OPTIONS = [
  { value: "all", label: "Read and unread" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

/** The accent a notice carries, read the same way as an announcement's tone. */
export const NOTIFICATION_TONES: Record<string, string> = {
  info: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  success: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/25",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
};
