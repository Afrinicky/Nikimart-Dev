"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Sorting and the result count, above a grid.
 *
 * A `<select>` rather than a custom dropdown. The product register is explicit
 * that reinventing a standard affordance for flavour is a product ban, and a
 * native select is the control that works with a keyboard, with a screen
 * reader and with a phone's own picker without any of it being rebuilt.
 *
 * Changing it pushes a new URL rather than filtering in place, so the sort is
 * in the address bar: shareable, bookmarkable, and still there after a back
 * button.
 */

const SORTS = [
  { value: "relevance", label: "Most relevant" },
  { value: "name", label: "Name, A to Z" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "newest", label: "Recently added" },
] as const;

export function CatalogueToolbar({
  total,
  showing,
  className,
}: {
  total: number;
  showing: number;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "relevance";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="medi-meta text-medi-muted" aria-live="polite">
        {total === 0 ? (
          "No products"
        ) : (
          <>
            Showing <span className="font-figures font-semibold text-medi-ink">{showing}</span> of{" "}
            <span className="font-figures font-semibold text-medi-ink">{total}</span>{" "}
            {total === 1 ? "product" : "products"}
          </>
        )}
      </p>

      <label className="flex items-center gap-2">
        <span className="medi-meta text-medi-muted">Sort by</span>
        <select
          value={current}
          onChange={(event) => {
            const next = new URLSearchParams(params.toString());
            if (event.target.value === "relevance") next.delete("sort");
            else next.set("sort", event.target.value);
            // A new sort means page one; staying on page four of the old order
            // shows a slice of a list the customer never saw the start of.
            next.delete("page");
            router.push(`?${next.toString()}`, { scroll: false });
          }}
          className="medi-focus h-9 rounded-lg bg-white pl-3 pr-8 text-[0.8125rem] font-medium text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
