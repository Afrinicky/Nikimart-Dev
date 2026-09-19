/**
 * The stretch of time the overview is describing.
 *
 * Pure, because the answer has to be identical in two places that cannot share
 * a server module: the reads that count against the window, and the control in
 * the browser that offers it. A picker that says "1–14 March" over figures
 * counted from the 2nd is the failure this exists to prevent.
 *
 * Three shapes, one type. A preset is a number of days back from today; all
 * time is a window with no start; a custom range is a pair of dates. Every
 * read takes the resulting value rather than a number of days, so none of them
 * had to learn a second way of being filtered.
 */

/** The preset lengths. Short enough to read, long enough to trend. */
export const OVERVIEW_RANGES = [7, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export interface OverviewWindow {
  /** Inclusive, at midnight. Null means "as far back as the records go". */
  start: Date | null;
  /** Exclusive, at midnight — the day after the last one in the window. */
  end: Date;
  /** Whole days covered. Null for all time, which has no length until read. */
  days: number | null;
  /** What it is called on screen: "last 30 days", "all time", "1–14 Mar 2026". */
  label: string;
  /** Which preset pill is lit: a range, "all", or "custom". */
  key: string;
  /** YYYY-MM-DD for the date inputs. Empty at the open end of all time. */
  from: string;
  to: string;
}

const DAY = 86_400_000;

/** A YYYY-MM-DD from a query string, at local midnight. Null when it isn't one. */
export function parseDay(raw: string | undefined | null): Date | null {
  const value = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  // Rejects the 31st of February rather than silently rolling it into March.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : null;
}

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The window the query string asks for.
 *
 * A valid pair of dates wins, because typing one is a more deliberate act than
 * whatever preset was on the URL before it. Anything unreadable falls back to
 * thirty days rather than erroring: a mistyped date in an address bar should
 * show the default screen, not a broken one.
 */
export function resolveWindow(
  params: { days?: string; from?: string; to?: string } = {},
  now: Date = new Date(),
): OverviewWindow {
  const today = midnight(now);
  // Exclusive, so everything that happened today is inside the window.
  const tomorrow = addDays(today, 1);

  const from = parseDay(params.from);
  const to = parseDay(params.to);
  if (from && to) {
    // Given back to front, which is a slip rather than an empty window.
    const [a, b] = from <= to ? [from, to] : [to, from];
    // A range ending in the future ends today: counting an empty fortnight
    // ahead into a daily average makes the business look half as busy.
    const last = b > today ? today : b;
    const end = addDays(last, 1);
    return {
      start: a,
      end,
      days: Math.max(1, Math.round((end.getTime() - a.getTime()) / DAY)),
      label: describeRange(a, last),
      key: "custom",
      from: dayKey(a),
      to: dayKey(last),
    };
  }

  if ((params.days ?? "").trim() === "all") {
    return {
      start: null,
      end: tomorrow,
      days: null,
      label: "all time",
      key: "all",
      from: "",
      to: dayKey(today),
    };
  }

  const n = Number(params.days);
  const days = (OVERVIEW_RANGES as readonly number[]).includes(n) ? (n as OverviewRange) : 30;
  const start = addDays(today, -(days - 1));
  return {
    start,
    end: tomorrow,
    days,
    label: `last ${days} days`,
    key: String(days),
    from: dayKey(start),
    to: dayKey(today),
  };
}

/**
 * How many days one point on the trend should cover.
 *
 * A two-year window drawn as seven hundred daily points is a mark a pixel wide
 * that nothing can hover — texture rather than data. Weeks and months keep the
 * shape readable and the crosshair usable.
 */
export function bucketSize(spanDays: number): number {
  if (spanDays <= 92) return 1;
  if (spanDays <= 550) return 7;
  return 30;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1–14 Mar 2026", "28 Feb – 3 Mar 2026", "14 Mar 2026". */
export function describeRange(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  if (sameMonth && from.getDate() === to.getDate()) {
    return `${from.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  }
  const left = sameMonth
    ? String(from.getDate())
    : `${from.getDate()} ${MONTHS[from.getMonth()]}${sameYear ? "" : ` ${from.getFullYear()}`}`;
  const right = `${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  return `${left}${sameMonth ? "–" : " – "}${right}`;
}

function midnight(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
