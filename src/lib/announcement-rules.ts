/**
 * When a notice is live, who it is for, and what to call it.
 *
 * Pure, because the answer has to be the same in three places that cannot
 * share code otherwise: the console listing it, the read that decides whether
 * an agent sees it, and the filter dropdown. A notice that reads "Live" on the
 * admin's screen and shows to nobody is the failure this exists to prevent.
 */

export type AnnouncementStatus = "live" | "scheduled" | "expired" | "hidden";

export interface AnnouncementWindow {
  isActive: boolean;
  publishAt?: Date | string | null;
  expiresAt?: Date | string | null;
}

function at(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * What state a notice is in, right now.
 *
 * Hidden beats everything: an admin who switched a notice off has said so, and
 * a schedule underneath it is not a second opinion. After that the window
 * decides — before it, scheduled; after it, expired; inside it, live.
 */
export function announcementStatus(
  notice: AnnouncementWindow,
  now: number = Date.now(),
): AnnouncementStatus {
  if (!notice.isActive) return "hidden";
  const from = at(notice.publishAt);
  const until = at(notice.expiresAt);
  if (from !== null && from > now) return "scheduled";
  if (until !== null && until <= now) return "expired";
  return "live";
}

/** Is this notice one somebody should be shown? Only ever "live". */
export function isShowable(notice: AnnouncementWindow, now: number = Date.now()): boolean {
  return announcementStatus(notice, now) === "live";
}

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  live: "Live",
  scheduled: "Scheduled",
  expired: "Expired",
  hidden: "Hidden",
};

export const ANNOUNCEMENT_STATUS_TONES: Record<AnnouncementStatus, string> = {
  live: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  scheduled: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  expired: "bg-niki-ink/10 text-niki-ink/60 ring-1 ring-niki-ink/15",
  hidden: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export const ANNOUNCEMENT_STATUS_OPTIONS = [
  { value: "all", label: "All status" },
  { value: "live", label: "Live" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "hidden", label: "Hidden" },
];

export const TONE_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "success", label: "Good news" },
];

export const TONE_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  success: "Good news",
};

/**
 * The audiences each console can address.
 *
 * Separate lists because they are separate businesses: the mall has customers
 * and shops, the bundle side has agents and the people buying from their
 * storefronts, and neither has any business naming the other's.
 */
export const DATA_AUDIENCES = [
  { value: "AGENTS", label: "Agents" },
  { value: "CUSTOMERS", label: "Bundle buyers" },
  { value: "EVERYONE", label: "Everyone" },
];

export const RETAIL_AUDIENCES = [
  { value: "CUSTOMERS", label: "Customers" },
  { value: "VENDORS", label: "Shops" },
  { value: "EVERYONE", label: "Everyone" },
];

export function audienceOptions(scope: "data" | "retail") {
  return scope === "data" ? DATA_AUDIENCES : RETAIL_AUDIENCES;
}

export function audienceFilterOptions(scope: "data" | "retail") {
  return [{ value: "all", label: "All audiences" }, ...audienceOptions(scope)];
}

export function audienceLabel(scope: "data" | "retail", value: string): string {
  return audienceOptions(scope).find((a) => a.value === value)?.label ?? value;
}

/** Does a notice aimed at `audience` reach a reader of this kind? */
export function reaches(audience: string, reader: string): boolean {
  return audience === "EVERYONE" || audience === reader;
}
