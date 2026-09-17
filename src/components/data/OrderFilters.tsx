"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The controls above every bundle-orders table: search, a status dropdown, a
 * network dropdown, and the count of what is being shown.
 *
 * One component for both consoles. The state lives in the query string rather
 * than in React — a filtered list is then a link somebody can send, a refresh
 * keeps what you were looking at, and Back walks the filters you tried. Every
 * change resets to page 1, because page 40 of a different filter is nowhere.
 */

export interface SelectOption {
  value: string;
  label: string;
}

const control =
  "h-11 w-full rounded-xl border border-niki-edge-strong bg-white px-3 text-sm text-niki-ink outline-none transition-colors focus:border-niki-orange";

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(control, "appearance-none pr-9 font-medium")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/40" />
    </div>
  );
}

/** The one search box: submit to apply, so a long reference isn't queried per keystroke. */
function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [term, setTerm] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(term.trim());
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by order ID, phone number…"
        aria-label="Search orders"
        className={cn(control, "pl-9")}
      />
    </form>
  );
}

export function OrderFilters({
  status,
  network,
  query,
  statusOptions,
  networkOptions,
  shown,
  total,
  page,
  pageCount,
  noun = "orders",
}: {
  status: string;
  network: string;
  query: string;
  statusOptions: SelectOption[];
  networkOptions: SelectOption[];
  shown: number;
  total: number;
  page: number;
  pageCount: number;
  noun?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  function go(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
          Refresh
        </button>
      </div>

      {open ? (
        <div className="animate-fade-up rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Keyed on the query so a filter set from a link or the Back
                button re-seeds the box, without an effect syncing the two. */}
            <SearchBox key={query} initial={query} onSearch={(q) => go({ q })} />

            <Select
              label="Filter by status"
              value={status}
              options={statusOptions}
              onChange={(v) => go({ status: v })}
            />
            <Select
              label="Filter by network"
              value={network}
              options={networkOptions}
              onChange={(v) => go({ network: v })}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-niki-ink/50">
            <p>
              Showing <span className="font-semibold text-niki-ink/70">{shown}</span> of{" "}
              <span className="font-semibold text-niki-ink/70">{total}</span> {noun}
            </p>
            <p>
              Page {page} of {pageCount}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
