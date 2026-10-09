/**
 * Which tier tonight's automatic snapshot belongs to.
 *
 * Grandfather-father-son: one dump per run, labelled by the longest period it
 * opens. Taking a separate daily, weekly and monthly on the first Monday of a
 * month would write three identical files for one instant; this gives the same
 * recovery points for a third of the storage.
 *
 * The decision is made from "has this period already got a snapshot" rather
 * than from the calendar alone, which is what makes it survive a gap: if the
 * job does not run on the 1st — a failed deploy, a sleeping platform — the
 * next run still takes that month's monthly rather than skipping the tier
 * until the 1st comes round again.
 *
 * Pure, and separate from backup-schedule.ts for that reason: the rule that
 * decides how much history a business keeps is worth testing without a
 * database.
 */

export type AutoKind = "auto-daily" | "auto-weekly" | "auto-monthly";

export const AUTO_KINDS: AutoKind[] = ["auto-daily", "auto-weekly", "auto-monthly"];

export function tierFor(
  now: Date,
  last: { weekly: Date | null; monthly: Date | null },
): AutoKind {
  if (!last.monthly || !sameMonth(last.monthly, now)) return "auto-monthly";
  if (!last.weekly || !sameIsoWeek(last.weekly, now)) return "auto-weekly";
  return "auto-daily";
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/**
 * ISO-8601 week and the year that week belongs to.
 *
 * The year is not always the calendar year: 1 January 2027 falls in week 53 of
 * 2026, and comparing week numbers without the year would call it the same
 * week as the previous January's. Thursday decides, which is the rule.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday is 7, not 0.
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year, week };
}

export function sameIsoWeek(a: Date, b: Date): boolean {
  const x = isoWeek(a);
  const y = isoWeek(b);
  return x.year === y.year && x.week === y.week;
}
