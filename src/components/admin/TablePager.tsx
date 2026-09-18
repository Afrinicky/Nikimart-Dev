"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Rows-per-page and paging for any console table, in one strip under it.
 *
 * Like the filters, both live in the query string: a page of 100 rows is a
 * link, and the choice survives a refresh. Someone reconciling a day's figures
 * wants all of it on one screen; someone on a phone wants ten.
 */

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export function TablePager({
  page,
  pageCount,
  perPage,
}: {
  page: number;
  pageCount: number;
  perPage: number;
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
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const btn =
    "niki-press niki-focus inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-niki-edge pt-4",
        pending && "opacity-60",
      )}
    >
      <label className="flex items-center gap-2 text-xs font-medium text-niki-ink/55">
        Rows per page
        <span className="relative">
          <select
            value={perPage}
            onChange={(e) => go({ per: e.target.value, page: null })}
            className="h-9 appearance-none rounded-xl border border-niki-edge-strong bg-white pl-3 pr-8 text-xs font-semibold text-niki-ink outline-none focus:border-niki-orange"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-niki-ink/40" />
        </span>
      </label>

      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-niki-ink/55">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          aria-label="First page"
          disabled={page <= 1}
          onClick={() => go({ page: null })}
          className={cn(btn, "px-2")}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go({ page: String(page - 1) })}
          className={btn}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go({ page: String(page + 1) })}
          className={btn}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Last page"
          disabled={page >= pageCount}
          onClick={() => go({ page: String(pageCount) })}
          className={cn(btn, "px-2")}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
