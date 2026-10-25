/**
 * Dates, as people here write them.
 *
 * "14 Mar 2026", not "3/14/2026" — Ghana writes day first, and a date on a
 * purchase order that could be read two ways is a delivery that arrives in the
 * wrong month. Explicit formatting rather than `toLocaleDateString` with a
 * locale, because the server's locale is not the business's.
 *
 * Pure, so the tests can run it.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** With the time, for an audit row or a received-at stamp. */
export function formatDateTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)}, ${hh}:${mm}`;
}

/** For a date input's `defaultValue`. */
export function toDateInput(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Whole days from now until a date. Negative when it has passed.
 *
 * Counted from midnight to midnight rather than by subtracting timestamps: a
 * deadline at 09:00 tomorrow is "1 day", not "0 days", and somebody reading
 * "0 days" on a Tuesday evening will think it is today.
 */
export function daysUntil(value: Date | string, from: Date = new Date()): number {
  const target = toDate(value);
  if (!target) return 0;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** "in 12 days", "today", "4 days ago" — for a deadline beside a date. */
export function relativeDays(value: Date | string, from: Date = new Date()): string {
  const days = daysUntil(value, from);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
