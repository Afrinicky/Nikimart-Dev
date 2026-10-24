"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Filters that live in the query string.
 *
 * Every filter is in the URL, which means a filtered table is a link: somebody
 * reconciling a month's payables can send "the four invoices in dispute" to
 * finance rather than describing how to find them. It also means the back
 * button works and a refresh does not reset the screen.
 */

export function FilterChips({
  name,
  options,
  allLabel = "All",
}: {
  /** The query-string key this set writes. */
  name: string;
  options: { value: string; label: string; count?: number }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = params.get(name);

  function go(value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(name);
    else next.set(name, value);
    // Any filter change means page one. Staying on page four of a list that
    // now has two pages shows an empty table and reads as a bug.
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", pending && "opacity-60")}>
      <Chip active={!current} onClick={() => go(null)} label={allLabel} />
      {options.map((option) => (
        <Chip
          key={option.value}
          active={current === option.value}
          onClick={() => go(option.value)}
          label={option.label}
          count={option.count}
        />
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "medi-focus medi-press inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-semibold transition-colors",
        active
          ? "bg-medi-teal-600 text-white"
          : "bg-white text-medi-body shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] hover:text-medi-ink",
      )}
    >
      {label}
      {count !== undefined ? (
        <span className={cn("font-figures", active ? "text-white/75" : "text-medi-muted")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The search box above a table.
 *
 * A form with a GET action, so it works before JavaScript loads and the result
 * is a real URL. Submitted rather than typed-through: a query that re-runs on
 * every keystroke is a query that runs twelve times to find one invoice.
 */
export function ConsoleSearch({
  placeholder = "Search",
  name = "q",
  className,
}: {
  placeholder?: string;
  name?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(name) ?? "";

  function submit(value: string) {
    const next = new URLSearchParams(params.toString());
    const trimmed = value.trim();
    if (trimmed) next.set(name, trimmed);
    else next.delete(name);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem(name);
        submit(input instanceof HTMLInputElement ? input.value : "");
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-medi-muted"
        aria-hidden
      />
      <input
        key={current}
        name={name}
        type="search"
        defaultValue={current}
        placeholder={placeholder}
        aria-label={placeholder}
        className="medi-focus h-9 w-full rounded-lg bg-white pl-9 pr-9 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] placeholder:text-medi-muted [&::-webkit-search-cancel-button]:appearance-none"
      />
      {current ? (
        <button
          type="button"
          onClick={() => submit("")}
          aria-label="Clear search"
          className="medi-focus absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-medi-muted hover:bg-medi-mint-100 hover:text-medi-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
