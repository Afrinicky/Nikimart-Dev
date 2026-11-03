"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { TableScroll } from "@/components/agent/AgentUi";
import { inputBase } from "@/components/ui/Field";
import { saveServicePrice } from "@/lib/data-bundles/service-agent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What this agent charges for each option, against what they are charged.
 *
 * The bundle pricing table's arrangement, because it is the same decision:
 * Nickimart's cost, the agent's price, and the margin between the two, edited
 * one row at a time and written straight through. An agent who has priced a
 * bundle ladder already knows how to price this one.
 *
 * "Standard" means they have set nothing and sell at Nickimart's own retail
 * price — the honest default, where they earn the usual margin without having
 * had to decide anything.
 */

export interface ServicePricingRow {
  variantId: string;
  serviceName: string;
  variantName: string;
  /** What Nickimart charges the agent. */
  agentPrice: number;
  /** Nickimart's own retail price, as a reference point. */
  retailPrice: number;
  /** What this agent charges. */
  price: number;
  commission: number;
  isCustom: boolean;
}

export function ServicePricingTable({ rows }: { rows: ServicePricingRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function write(variantId: string, price: string) {
    setError(null);
    setBusy(variantId);
    const fd = new FormData();
    fd.set("variantId", variantId);
    fd.set("price", price);
    const result = await saveServicePrice({}, fd);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(null);
    startTransition(() => router.refresh());
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">
        No services are resold to agents yet.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="animate-fade-up mb-3 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <TableScroll>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
              <th className="py-2.5 pr-4 font-semibold">Service</th>
              <th className="py-2.5 pr-4 font-semibold">Option</th>
              <th className="py-2.5 pr-4 font-semibold">Your cost</th>
              <th className="py-2.5 pr-4 font-semibold">Your price</th>
              <th className="py-2.5 pr-4 font-semibold">You earn</th>
              <th className="py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-niki-edge">
            {rows.map((r) => {
              const isEditing = editing === r.variantId;
              const working = busy === r.variantId;

              return (
                <tr key={r.variantId} className="transition-colors hover:bg-niki-surface/70">
                  <td className="py-3 pr-4 font-medium text-niki-ink">{r.serviceName}</td>
                  <td className="py-3 pr-4 text-niki-ink/70">{r.variantName}</td>
                  <td className="py-3 pr-4 text-niki-ink/55">{formatMoney(r.agentPrice)}</td>
                  <td className="py-3 pr-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min={r.agentPrice}
                        step="0.01"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void write(r.variantId, draft);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className={cn(inputBase, "w-28 py-1.5")}
                      />
                    ) : (
                      <span className="font-figures font-bold text-niki-ink">
                        {formatMoney(r.price)}
                        {!r.isCustom ? (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-niki-ink/35">
                            standard
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-3 pr-4 font-figures font-bold",
                      r.commission > 0 ? "text-niki-success" : "text-niki-ink/35",
                    )}
                  >
                    {formatMoney(r.commission)}
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1">
                      {working ? (
                        <Loader2 className="h-4 w-4 animate-spin text-niki-ink/40" />
                      ) : isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void write(r.variantId, draft)}
                            aria-label="Save price"
                            className="niki-press rounded-lg bg-niki-success/10 p-2 text-niki-success"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            aria-label="Cancel"
                            className="niki-press rounded-lg bg-niki-surface p-2 text-niki-ink/50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(r.variantId);
                              setDraft(String(r.price));
                            }}
                            aria-label={`Edit the price of ${r.variantName}`}
                            className="niki-press rounded-lg bg-niki-surface p-2 text-niki-ink/55 hover:bg-niki-black/5 hover:text-niki-ink"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {r.isCustom ? (
                            <button
                              type="button"
                              onClick={() => void write(r.variantId, "")}
                              aria-label={`Put ${r.variantName} back on the standard price`}
                              title="Back to the standard price"
                              className="niki-press rounded-lg bg-niki-surface p-2 text-niki-ink/40 hover:bg-niki-black/5 hover:text-niki-ink"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>

      <p className="mt-3 text-xs text-niki-ink/45">
        Your price can&apos;t go below your cost. A faster delivery option adds its fee to both
        sides, so it never changes what you earn.
      </p>
    </div>
  );
}
