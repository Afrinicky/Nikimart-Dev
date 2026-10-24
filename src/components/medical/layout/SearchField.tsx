"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Catalogue search.
 *
 * The single most-used control on this site, so it gets real width rather than
 * an icon that opens a modal. A laboratory scientist arrives knowing the
 * catalogue number; the fastest path from there to the product is a field they
 * can type into without a click first.
 *
 * A plain form with a GET action, not a controlled component posting to a
 * route handler: it works before JavaScript loads, the result is a real URL
 * that can be shared and bookmarked, and the back button does what it should.
 */
export function SearchField({
  className,
  autoFocus = false,
  onSubmitted,
}: {
  className?: string;
  autoFocus?: boolean;
  /** Lets the mobile sheet close itself once a search is run. */
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      action="/medicals/search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        const q = value.trim();
        if (q.length < 2) {
          // Two characters is the floor the server search enforces. Catching it
          // here keeps the customer on the page they are on rather than landing
          // them on an empty results screen that explains the rule afterwards.
          event.preventDefault();
          input.current?.focus();
          return;
        }
        event.preventDefault();
        router.push(`/medicals/search?q=${encodeURIComponent(q)}`);
        onSubmitted?.();
      }}
    >
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medi-muted"
        aria-hidden
      />
      <input
        ref={input}
        name="q"
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by product or catalogue number"
        aria-label="Search the catalogue"
        className={cn(
          "medi-focus h-11 w-full rounded-xl bg-medi-surface pl-10 pr-10 text-sm text-medi-ink",
          "shadow-[inset_0_0_0_1px_var(--color-medi-rule)] transition-shadow",
          "placeholder:text-medi-muted",
          "hover:shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]",
          "focus:bg-white",
          // The browser's own search affordance is inconsistent across engines
          // and sits where the clear button below goes.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="medi-focus absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-medi-muted transition-colors hover:bg-medi-mint-100 hover:text-medi-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
