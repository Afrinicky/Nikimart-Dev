/**
 * What a team is, stated once.
 *
 * Pure, because the same answers are needed by the reads that count a team and
 * by the screens that draw one. A member who reads "active" on the dashboard
 * and "quiet" in the table is the drift this exists to prevent.
 *
 * Nothing here calculates money. What a leader earns is decided by the referral
 * rules and written to the ledger; the team module only ever reads back what
 * those already recorded, so a change to a commission rate can never mean two
 * different answers on two screens.
 */

/**
 * The ledger entries that are a leader's income from somebody else's work:
 * joining rewards, their share of a recruit's registration, and commission on
 * a downline's sales. Every one carries the agent it came from, which is what
 * makes "what has this member earned me" a question the ledger can answer.
 */
export const TEAM_INCOME_TYPES = [
  "REFERRAL_L1",
  "REFERRAL_L2",
  "REFERRAL_FEE_SHARE",
  "TEAM_COMMISSION",
] as const;

export type TeamIncomeType = (typeof TEAM_INCOME_TYPES)[number];

export const TEAM_INCOME_LABELS: Record<TeamIncomeType, string> = {
  REFERRAL_L1: "Joining reward",
  REFERRAL_L2: "Second-level reward",
  REFERRAL_FEE_SHARE: "Share of registration",
  TEAM_COMMISSION: "Commission on their sales",
};

/** How long an agent can go without a sale before the team stops counting them. */
export const ACTIVE_WINDOW_DAYS = 30;
/** How recently somebody must have joined to still be new. */
export const NEW_MEMBER_DAYS = 30;

export type MemberActivity = "active" | "quiet" | "dormant" | "never";

/**
 * Whether a member is trading, going quiet, or gone.
 *
 * Three states rather than two, because "inactive" covers both the agent who
 * sold last month and the one who has never sold at all, and those need
 * different conversations from a leader.
 */
export function memberActivity(
  lastSoldAt: Date | null | undefined,
  now: Date = new Date(),
): MemberActivity {
  if (!lastSoldAt) return "never";
  const days = daysBetween(lastSoldAt, now);
  if (days <= ACTIVE_WINDOW_DAYS) return "active";
  if (days <= ACTIVE_WINDOW_DAYS * 3) return "quiet";
  return "dormant";
}

export const ACTIVITY_LABELS: Record<MemberActivity, string> = {
  active: "Active",
  quiet: "Going quiet",
  dormant: "Dormant",
  never: "Not started",
};

export const ACTIVITY_TONES: Record<MemberActivity, string> = {
  active: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/25",
  quiet: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  dormant: "bg-niki-ink/8 text-niki-ink/55 ring-1 ring-niki-ink/15",
  never: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
};

/** Somebody who joined inside the window, for "new this month". */
export function isNewMember(joinedAt: Date, now: Date = new Date()): boolean {
  return daysBetween(joinedAt, now) <= NEW_MEMBER_DAYS;
}

/** Whole days between two moments, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Growth as a percentage, or null when there is nothing to grow from.
 *
 * A team going from nobody to three members has not grown by 300% — it has
 * started. Saying so is more honest than a number that looks like a rate.
 */
export function growthPercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/**
 * How deep the team goes.
 *
 * Two, because two is what pays: the referral programme rewards a direct
 * recruit and a recruit's recruit, and a tree that showed a third level would
 * be showing a leader people they earn nothing from and cannot help.
 */
export const TEAM_DEPTH = 2;

export type TeamLevel = 1 | 2;

export const LEVEL_LABELS: Record<TeamLevel, string> = {
  1: "Direct recruits",
  2: "Their recruits",
};
