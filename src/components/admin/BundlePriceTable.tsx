"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { formatPrice } from "@/lib/format";
import { NETWORK_INFO, bundleLabel, type Network } from "@/lib/data-bundles/networks";
import { deleteBundle, saveBundlePrices, type DataAdminState } from "@/lib/data-bundles/admin-actions";

export interface EditableBundle {
  id: string;
  sizeGb: number;
  price: number;
  costPrice: number;
  isActive: boolean;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save prices"}
    </button>
  );
}

/**
 * The price manager for one network. Rows carry both the provider's cost and
 * NikiMart's selling price so the margin is visible while you type — the number
 * that actually decides whether a sale is worth making.
 */
export function BundlePriceTable({
  network,
  bundles,
}: {
  network: Network;
  bundles: EditableBundle[];
}) {
  const info = NETWORK_INFO[network];
  const [state, formAction] = useActionState<DataAdminState, FormData>(saveBundlePrices, {});
  // Mirror the inputs so the margin column updates as you type.
  const [draft, setDraft] = useState<Record<string, { price: number; cost: number }>>(() =>
    Object.fromEntries(bundles.map((b) => [b.id, { price: b.price, cost: b.costPrice }])),
  );

  function set(id: string, key: "price" | "cost", raw: string) {
    const n = Number(raw);
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: Number.isFinite(n) ? n : 0 } }));
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${info.accentFrom}, ${info.accentTo})`, color: info.onAccent }}
      >
        <div>
          <p className="font-display text-lg font-bold">{info.label}</p>
          <p className="text-xs opacity-80">{bundles.length} sizes</p>
        </div>
      </div>

      <form action={formAction}>
        {state.error ? (
          <p className="mx-5 mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="mx-5 mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
            {state.message}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                <th className="px-5 py-3">Size</th>
                <th className="px-3 py-3">Cost (GH₵)</th>
                <th className="px-3 py-3">Sell (GH₵)</th>
                <th className="px-3 py-3">Margin</th>
                <th className="px-3 py-3">On sale</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const d = draft[b.id] ?? { price: b.price, cost: b.costPrice };
                const margin = d.cost > 0 ? d.price - d.cost : null;
                const marginPct = d.cost > 0 ? Math.round(((d.price - d.cost) / d.cost) * 100) : null;
                return (
                  <tr key={b.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-2.5">
                      <input type="hidden" name="bundleId" value={b.id} />
                      <span className="font-display font-bold text-niki-ink">{bundleLabel(b.sizeGb)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`cost:${b.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={b.costPrice || ""}
                        onChange={(e) => set(b.id, "cost", e.target.value)}
                        placeholder="0.00"
                        className={`${inputClass} max-w-[7.5rem] px-3 py-1.5`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`price:${b.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={b.price}
                        onChange={(e) => set(b.id, "price", e.target.value)}
                        required
                        className={`${inputClass} max-w-[7.5rem] px-3 py-1.5 font-semibold`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {margin === null ? (
                        <span className="text-xs text-niki-ink/40">—</span>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${margin > 0 ? "text-niki-success" : "text-niki-danger"}`}
                        >
                          {formatPrice(Math.round(margin * 100) / 100)}
                          <span className="ml-1 font-normal text-niki-ink/40">({marginPct}%)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        name={`active:${b.id}`}
                        defaultChecked={b.isActive}
                        className="h-4 w-4 rounded"
                        aria-label={`${bundleLabel(b.sizeGb)} on sale`}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {/* A nested <form> is invalid HTML, so delete rides the
                          same form with its own action and carries the row id
                          as the submitting button's value. */}
                      <button
                        type="submit"
                        name="id"
                        value={b.id}
                        formAction={deleteBundle}
                        formNoValidate
                        onClick={(e) => {
                          if (!confirm(`Remove ${bundleLabel(b.sizeGb)} ${info.label} from sale permanently?`)) {
                            e.preventDefault();
                          }
                        }}
                        aria-label={`Delete ${bundleLabel(b.sizeGb)}`}
                        className="rounded-lg p-1.5 text-niki-ink/40 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end px-5 py-4">
          <SaveButton />
        </div>
      </form>
    </section>
  );
}
