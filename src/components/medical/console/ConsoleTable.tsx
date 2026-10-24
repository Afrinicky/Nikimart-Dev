import type { ReactNode } from "react";
import { PackageSearch } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The table every screen in this console uses.
 *
 * One component rather than a dozen copies, so that purchase orders behave
 * exactly like goods received, which behave exactly like tenders: the same
 * card, the same rounded header row, the same hover, the same pager strip
 * underneath. The retail affiliate console makes the same argument in the same
 * words, and it is right — a console whose tables each work slightly
 * differently is one people stop trusting their own figures in.
 */

export const th =
  "px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted";
export const td = "px-4 py-3.5 align-middle text-[0.8125rem] text-medi-body";
/** The first cell of a row: the reference, the name, the thing you scan for. */
export const tdKey = "px-4 py-3.5 align-middle text-[0.8125rem] font-semibold text-medi-ink";
/** A money or quantity cell. Tabular figures, right-aligned. */
export const tdNum = "px-4 py-3.5 align-middle text-right font-figures text-[0.8125rem] text-medi-ink";
export const thNum =
  "px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted";

export function ConsoleTable({
  columns,
  minWidth = 960,
  empty,
  children,
  footer,
}: {
  /** The header row. Pass `{ label, numeric }` to right-align a column. */
  columns: (string | { label: string; numeric?: boolean })[];
  minWidth?: number;
  empty?: { title: string; body: string; action?: ReactNode };
  /** The `<tr>` rows. Empty renders the empty state instead of a bare table. */
  children: ReactNode;
  /** Usually the pager. Sits inside the card, under the table. */
  footer?: ReactNode;
}) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;

  if (isEmpty) {
    return (
      <div className="medi-panel medi-panel-lg mt-4 px-6 py-14 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-medi-mint-50 text-medi-teal-600">
          <PackageSearch className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-[0.9375rem] font-bold text-medi-ink">
          {empty?.title ?? "Nothing here yet"}
        </p>
        <p className="medi-prose mx-auto mt-1 text-[0.875rem] text-medi-body">
          {empty?.body ?? "Nothing matches these filters."}
        </p>
        {empty?.action ? <div className="mt-5">{empty.action}</div> : null}
      </div>
    );
  }

  return (
    <div className="medi-panel medi-panel-lg mt-4 p-4 sm:p-5">
      {/*
        `relative` is load-bearing, not decoration. A visually hidden label
        inside a cell is position: absolute, and with nothing positioned between
        it and the page its containing block is the document — so a scroller
        like this one does not clip it, it sits at its static position inside a
        table wider than a phone, and the whole page scrolls sideways by a few
        hundred pixels. Making the scroller the containing block puts those
        labels back inside it. Every wide table in this console does the same.
      */}
      <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead>
            <tr className="bg-medi-mint-50">
              {columns.map((column, index) => {
                const label = typeof column === "string" ? column : column.label;
                const numeric = typeof column === "string" ? false : column.numeric;
                return (
                  <th
                    key={label || index}
                    scope="col"
                    className={cn(
                      numeric ? thNum : th,
                      index === 0 && "rounded-l-xl",
                      index === columns.length - 1 && "rounded-r-xl",
                    )}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">{rows}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/** A row. Hover is the affordance that says the row is worth clicking. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("transition-colors hover:bg-medi-mint-50/60", className)}>{children}</tr>
  );
}
