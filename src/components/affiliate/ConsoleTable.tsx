import type { ReactNode } from "react";
import { Suspense } from "react";
import { PackageSearch } from "lucide-react";
import { TablePager } from "@/components/admin/TablePager";
import { cn } from "@/lib/cn";

/**
 * The table every screen in this console uses.
 *
 * One component rather than eight copies, so the affiliate's tables behave
 * exactly like the admin's bundle-orders table they were modelled on: the same
 * card, the same rounded header row, the same hover, the same pager strip
 * underneath. A console whose tables each work slightly differently is one
 * people stop trusting their own figures in.
 */

export const th =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
export const td = "px-4 py-3.5 align-middle";

export function ConsoleTable({
  columns,
  minWidth = 1040,
  page,
  pageCount,
  perPage,
  empty = "Nothing matches these filters.",
  children,
}: {
  /** The header row. The first and last get the rounded corners. */
  columns: string[];
  minWidth?: number;
  page: number;
  pageCount: number;
  perPage: number;
  empty?: string;
  /** The `<tr>` rows. Empty renders the empty state instead of a bare table. */
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;

  if (isEmpty) {
    return (
      <div className="mt-4 rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-niki-edge">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <PackageSearch className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-niki-ink/55">{empty}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="-mx-5 overflow-x-auto px-5">
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead>
            <tr className="bg-niki-surface/70">
              {columns.map((column, i) => (
                <th
                  key={`${column}-${i}`}
                  className={cn(
                    th,
                    i === 0 && "rounded-l-xl",
                    i === columns.length - 1 && "rounded-r-xl",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>

      <Suspense fallback={<div className="h-12" />}>
        <TablePager page={page} pageCount={pageCount} perPage={perPage} />
      </Suspense>
    </div>
  );
}

/** One row, with the hover and the hairline the console's tables share. */
export function ConsoleRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50">
      {children}
    </tr>
  );
}

/**
 * A state as a pill.
 *
 * Status is a state, not a measure, so it wears the reserved status colours
 * and always carries its written label — the state is never colour alone.
 */
const TONES: Record<string, string> = {
  // Commission lifecycle
  pending: "bg-niki-ink/10 text-niki-ink/70",
  clearing: "bg-niki-gold/20 text-amber-800",
  cleared: "bg-niki-success/10 text-niki-success",
  paid: "bg-niki-trust/10 text-niki-trust",
  reversed: "bg-niki-danger/10 text-niki-danger",
  // Orders
  shipped: "bg-niki-trust/10 text-niki-trust",
  delivered: "bg-niki-success/10 text-niki-success",
  cancelled: "bg-niki-danger/10 text-niki-danger",
  // Payouts and accounts
  processing: "bg-niki-orange/10 text-niki-orange",
  rejected: "bg-niki-danger/10 text-niki-danger",
  active: "bg-niki-success/10 text-niki-success",
  suspended: "bg-niki-danger/10 text-niki-danger",
  approved: "bg-niki-success/10 text-niki-success",
  // Link state
  live: "bg-niki-success/10 text-niki-success",
  paused: "bg-niki-ink/10 text-niki-ink/70",
  ineligible: "bg-niki-danger/10 text-niki-danger",
  // Conversations. "Needs your reply" is the only one that nags.
  open: "bg-niki-orange/10 text-niki-orange",
  waiting_affiliate: "bg-niki-orange/10 text-niki-orange",
  waiting_customer: "bg-niki-ink/10 text-niki-ink/70",
  waiting_support: "bg-niki-trust/10 text-niki-trust",
  resolved: "bg-niki-success/10 text-niki-success",
  urgent: "bg-niki-danger/10 text-niki-danger",
  high: "bg-niki-gold/20 text-amber-800",
  normal: "bg-niki-ink/10 text-niki-ink/70",
};

export function ConsolePill({
  status,
  label,
  title,
}: {
  status: string;
  label?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold",
        TONES[status] ?? "bg-niki-ink/10 text-niki-ink/70",
      )}
    >
      {label ?? status}
    </span>
  );
}

/** The date format every table in the console uses. */
export function formatWhen(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The same, without the clock — for a date that is only ever a day. */
export function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
