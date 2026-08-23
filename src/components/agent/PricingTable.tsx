"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Percent, X } from "lucide-react";
import { BusyButton } from "@/components/ui/motion";
import { TableScroll } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NETWORK_INFO, bundleLabel, type Network } from "@/lib/data-bundles/networks";
import {
  applyBulkMarkup,
  setAgentPrice,
  setAgentPriceActive,
} from "@/lib/data-bundles/agent-actions";

export interface PricingRow {
  network: Network;
  sizeGb: number;
  agentPrice: number;
  price: number;
  profit: number;
  isActive: boolean;
}

/**
 * Package Pricing: what NikiMart charges the agent, what they charge, and the
 * profit between the two — editable one row at a time, or all at once with a
 * markup.
 *
 * Every control writes straight through and refreshes: there is no Save button
 * to forget, and a toggle that looks flipped is a toggle that *is* flipped.
 */
export function PricingTable({ rows }: { rows: PricingRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Network | "ALL">("ALL");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markup, setMarkup] = useState("20");
  const [pending, startTransition] = useTransition();

  const shown = filter === "ALL" ? rows : rows.filter((r) => r.network === filter);
  const networks = Array.from(new Set(rows.map((r) => r.network)));
  const keyOf = (r: PricingRow) => `${r.network}|${r.sizeGb}`;

  async function savePrice(row: PricingRow) {
    setError(null);
    setBusyKey(keyOf(row));
    const result = await setAgentPrice({
      network: row.network,
      sizeGb: row.sizeGb,
      price: Number(draft),
    });
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    startTransition(() => router.refresh());
  }

  async function toggle(row: PricingRow) {
    setError(null);
    setBusyKey(keyOf(row));
    const result = await setAgentPriceActive({
      network: row.network,
      sizeGb: row.sizeGb,
      isActive: !row.isActive,
    });
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function bulk() {
    setError(null);
    setBusyKey("bulk");
    const result = await applyBulkMarkup(Number(markup));
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
        NikiMart hasn&apos;t published agent prices for any bundle yet. Once it does, your ladder
        appears here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-niki-gold/10 px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-gold/40">
        <span className="font-semibold text-niki-ink">Set your own prices.</span> Mark up your cost
        to earn on each sale — the difference is credited to your balance once the bundle is
        delivered. Toggle a bundle off to hide it from your store.
      </p>

      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      {/* Filter + bulk markup */}
      <div className="flex flex-col gap-3 rounded-xl bg-niki-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {(["ALL", ...networks] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFilter(n as Network | "ALL")}
              className={cn(
                "niki-press niki-focus shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === n
                  ? "bg-niki-navy text-white"
                  : "bg-white text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-navy/5",
              )}
            >
              {n === "ALL" ? "All networks" : NETWORK_INFO[n as Network].short}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-niki-ink/60 ring-1 ring-niki-edge">
            <Percent className="h-3.5 w-3.5" />
            <input
              inputMode="decimal"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="w-12 bg-transparent text-right outline-none"
              aria-label="Markup percent"
            />
            %
          </label>
          <BusyButton
            type="button"
            onClick={bulk}
            busy={busyKey === "bulk"}
            pendingLabel="Applying…"
            className="rounded-full bg-niki-navy px-4 py-2 text-xs font-bold text-white"
          >
            Price all
          </BusyButton>
        </div>
      </div>

      <TableScroll>
        <table className={cn("w-full min-w-[680px] text-left text-sm", pending && "opacity-70")}>
          <thead>
            <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
              <th className="py-2.5 pr-4 font-semibold">Package</th>
              <th className="py-2.5 pr-4 font-semibold">Size</th>
              <th className="py-2.5 pr-4 font-semibold">Your cost</th>
              <th className="py-2.5 pr-4 font-semibold">Your price</th>
              <th className="py-2.5 pr-4 font-semibold">Profit</th>
              <th className="py-2.5 font-semibold">In store</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-niki-edge">
            {shown.map((r) => {
              const key = keyOf(r);
              const isEditing = editing === key;
              const busy = busyKey === key;
              return (
                <tr key={key} className="transition-colors hover:bg-niki-surface/70">
                  <td className="py-3 pr-4">
                    <span
                      className="inline-flex rounded-md px-2 py-1 text-[11px] font-bold"
                      style={{
                        background: NETWORK_INFO[r.network].accentFrom,
                        color: NETWORK_INFO[r.network].onAccent,
                      }}
                    >
                      {NETWORK_INFO[r.network].short}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-niki-ink">{bundleLabel(r.sizeGb)}</td>
                  <td className="py-3 pr-4 text-niki-ink/60">{formatMoney(r.agentPrice)}</td>
                  <td className="py-3 pr-4">
                    {isEditing ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          inputMode="decimal"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePrice(r);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-24 rounded-lg border border-niki-orange/50 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-niki-orange/20"
                        />
                        <BusyButton
                          type="button"
                          busy={busy}
                          onClick={() => savePrice(r)}
                          aria-label="Save price"
                          className="rounded-lg bg-niki-success p-1.5 text-white"
                        >
                          {busy ? null : <Check className="h-3.5 w-3.5" />}
                        </BusyButton>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          aria-label="Cancel"
                          className="niki-press rounded-lg bg-niki-surface p-1.5 text-niki-ink/50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(key);
                          setDraft(String(r.price));
                        }}
                        className="niki-press niki-focus group flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-niki-ink hover:bg-niki-orange/10"
                      >
                        {formatMoney(r.price)}
                        <Pencil className="h-3 w-3 text-niki-ink/30 group-hover:text-niki-orange" />
                      </button>
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-3 pr-4 font-semibold",
                      r.profit > 0 ? "text-niki-success" : "text-niki-ink/30",
                    )}
                  >
                    {r.profit > 0 ? `+${formatMoney(r.profit)}` : "—"}
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => toggle(r)}
                      disabled={busy}
                      role="switch"
                      aria-checked={r.isActive}
                      aria-label={`${r.isActive ? "Hide" : "Show"} ${bundleLabel(r.sizeGb)} ${NETWORK_INFO[r.network].short}`}
                      className={cn(
                        "niki-focus relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
                        r.isActive ? "bg-niki-success" : "bg-niki-ink/20",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform",
                          r.isActive ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>

      <p className="text-xs text-niki-ink/45">
        Showing {shown.length} of {rows.length} packages.
      </p>
    </div>
  );
}
