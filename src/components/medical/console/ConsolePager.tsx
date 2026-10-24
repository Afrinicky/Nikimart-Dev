"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Rows-per-page and paging, in one strip under a console table.
 *
 * Both live in the query string, like the filters: a page of 100 rows is a
 * link, and the choice survives a refresh. Somebody reconciling a month wants
 * all of it on one screen; somebody checking one delivery on a phone wants ten.
 */

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

export function ConsolePager({
  page,
  pageCount,
  perPage,
  total,
}: {
  page: number;
  pageCount: number;
  perPage: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const button =
    "medi-press medi-focus inline-flex h-8 items-center justify-center rounded-lg px-2 text-medi-body " +
    "shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] transition-colors hover:text-medi-ink " +
    "disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-medi-body";

  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-medi-rule pt-4",
        pending && "opacity-60",
      )}
    >
      <label className="flex items-center gap-2 text-[0.75rem] font-medium text-medi-muted">
        Rows
        <select
          value={perPage}
          onChange={(event) => go({ per: event.target.value, page: null })}
          className="medi-focus h-8 rounded-lg bg-white pl-2 pr-7 text-[0.75rem] font-semibold text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="font-figures hidden sm:inline">
          {total} {total === 1 ? "row" : "rows"}
        </span>
      </label>

      <div className="flex items-center gap-1.5">
        <span className="font-figures mr-1 text-[0.75rem] font-medium text-medi-muted">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          aria-label="First page"
          disabled={page <= 1}
          onClick={() => go({ page: null })}
          className={button}
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => go({ page: page <= 2 ? null : String(page - 1) })}
          className={button}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => go({ page: String(page + 1) })}
          className={button}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Last page"
          disabled={page >= pageCount}
          onClick={() => go({ page: String(pageCount) })}
          className={button}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Read `page` and `per` out of a search-params object, safely. */
export function readPaging(
  query: Record<string, string | string[] | undefined>,
): { page: number; perPage: number; skip: number } {
  const pageRaw = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const perRaw = Number(Array.isArray(query.per) ? query.per[0] : query.per);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  // Clamped to the offered options. A hand-edited `?per=100000` is a query
  // that tries to read the whole table into memory.
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE;
  return { page, perPage, skip: (page - 1) * perPage };
}
