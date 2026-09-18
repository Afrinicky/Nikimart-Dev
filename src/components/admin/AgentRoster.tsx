"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The agent list, as something you can actually find somebody in.
 *
 * A roster is a lookup tool, not a report: the question is nearly always
 * "where is this one agent", asked with a store name, an agent code or the
 * last four digits of a phone number in hand. So it searches across all of
 * those at once, filters by the two states that change what you do next, and
 * leaves the numbers to the agent's own window.
 *
 * Filtering here rather than on the server because the whole roster is already
 * loaded and a network round trip per keystroke is a worse experience than any
 * amount of client-side work on a few hundred rows.
 */

export interface RosterAgent {
  id: string;
  storeName: string;
  slug: string;
  code: string;
  ownerName: string;
  phone: string;
  status: string;
  balance: number;
  totalSales: number;
  orderCount: number;
  canSignIn: boolean;
}

type Filter = "all" | "active" | "suspended" | "never-signed-in";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "never-signed-in", label: "Never signed in" },
];

export function AgentRoster({ agents }: { agents: RosterAgent[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (filter === "active" && a.status !== "active") return false;
      if (filter === "suspended" && a.status === "active") return false;
      if (filter === "never-signed-in" && a.canSignIn) return false;
      if (!q) return true;
      return (
        a.storeName.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q)
      );
    });
  }, [agents, query, filter]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search agents</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by store, code, name or phone"
            className="niki-focus w-full rounded-xl bg-niki-surface py-2.5 pl-9 pr-3 text-sm text-niki-ink placeholder:text-niki-ink/40"
          />
        </label>

        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "niki-press niki-focus shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                filter === f.key
                  ? "bg-niki-black text-white"
                  : "bg-niki-surface text-niki-ink/60 hover:text-niki-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-niki-surface px-4 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-niki-ink/35">
            <Users className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">
            {agents.length === 0 ? "No agents yet" : "Nobody matches that"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">
            {agents.length === 0
              ? "Register an agent, or share a registration link. Set an agent price on your bundles first, or there'll be nothing for them to sell."
              : "Try a store name, an agent code or part of a phone number."}
          </p>
        </div>
      ) : (
        <>
          {/* The column heads only earn their space where there are columns. */}
          <div className="mt-4 hidden grid-cols-12 gap-3 px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40 lg:grid">
            <span className="col-span-4">Store</span>
            <span className="col-span-3">Agent</span>
            <span className="col-span-2 text-right">Sales</span>
            <span className="col-span-2 text-right">Balance</span>
            <span className="col-span-1 text-right">Status</span>
          </div>

          <ul className="mt-2 space-y-2 lg:mt-0 lg:space-y-1">
            {rows.map((a) => (
              <li key={a.id}>
                <ActionLink
                  href={`/admin/data/agents/${a.id}`}
                  className="niki-focus group grid grid-cols-1 items-center gap-1 rounded-xl bg-niki-surface/70 px-4 py-3 transition-colors hover:bg-niki-orange/10 lg:grid-cols-12 lg:gap-3 lg:bg-transparent lg:hover:bg-niki-surface"
                >
                  <div className="min-w-0 lg:col-span-4">
                    <p className="truncate font-semibold text-niki-ink">{a.storeName}</p>
                    <p className="truncate font-mono text-[11px] text-niki-ink/40">/{a.slug}</p>
                  </div>

                  <div className="min-w-0 lg:col-span-3">
                    <p className="truncate text-xs text-niki-ink/65">
                      <span className="font-mono font-semibold text-niki-ink/75">{a.code}</span>
                      {a.ownerName ? ` · ${a.ownerName}` : ""}
                    </p>
                    <p className="truncate font-mono text-[11px] text-niki-ink/40">
                      {a.phone || "—"}
                    </p>
                  </div>

                  {/* On a phone the three numbers read as one line rather than
                      three stacked rows nobody can scan. */}
                  <div className="mt-1 flex items-center justify-between gap-3 lg:col-span-5 lg:mt-0 lg:grid lg:grid-cols-5 lg:gap-3">
                    <span className="text-xs text-niki-ink/60 lg:col-span-2 lg:text-right lg:text-sm lg:text-niki-ink/75">
                      <span className="lg:hidden">Sales </span>
                      {formatMoney(a.totalSales)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold lg:col-span-2 lg:text-right lg:text-sm",
                        a.balance < 0 ? "text-niki-danger" : "text-niki-success",
                      )}
                    >
                      {formatMoney(a.balance)}
                    </span>
                    <span className="flex shrink-0 items-center justify-end gap-1 lg:col-span-1">
                      <StatusDot status={a.status} canSignIn={a.canSignIn} />
                      <ChevronRight className="h-4 w-4 text-niki-ink/25 transition-colors group-hover:text-niki-orange" />
                    </span>
                  </div>
                </ActionLink>
              </li>
            ))}
          </ul>

          <p className="mt-4 px-1 text-xs text-niki-ink/45">
            {rows.length} of {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </p>
        </>
      )}
    </div>
  );
}

/** Status as a dot with a label — a pill per row is a wall of colour. */
function StatusDot({ status, canSignIn }: { status: string; canSignIn: boolean }) {
  const suspended = status !== "active";
  const label = suspended ? "Suspended" : canSignIn ? "Active" : "Not signed in";
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
        suspended
          ? "bg-niki-danger/10 text-niki-danger"
          : canSignIn
            ? "bg-niki-success/10 text-niki-success"
            : "bg-amber-100 text-amber-800",
      )}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          suspended ? "bg-niki-danger" : canSignIn ? "bg-niki-success" : "bg-amber-500",
        )}
      />
      <span aria-hidden className="hidden xl:inline">
        {label}
      </span>
    </span>
  );
}
