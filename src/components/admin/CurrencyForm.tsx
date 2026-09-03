"use client";

import { useActionState, useState } from "react";
import { Coins, RefreshCw, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { HOME_CURRENCY, type Currency } from "@/lib/shipping";
import { deleteCurrency, saveCurrency, type ShippingState } from "@/lib/shipping-admin-actions";

/**
 * The exchange rates every foreign freight quote is converted through.
 *
 * This is the highest-leverage screen in the console and the least obvious one,
 * so it says out loud what it does: a forwarder quotes $260 per cubic metre,
 * the buyer pays cedis, and the number below is the only thing standing between
 * them. Correct it on the day the cedi moves and every imported listing on the
 * platform re-prices itself. Nothing else has to be touched — which is exactly
 * why the rates are stored as the forwarder quoted them rather than converted
 * once and forgotten.
 */
export function CurrencyForm({
  currencies,
  usage,
}: {
  currencies: Currency[];
  /** Currency code → how many routes quote in it. */
  usage: Record<string, number>;
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveCurrency, {});
  const [editing, setEditing] = useState<Currency | null>(null);

  const key = editing?.code ?? "new";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Coins className="h-5 w-5 text-niki-orange" />
          Exchange rates
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          What one unit of each currency is worth in cedis. Freight abroad is quoted in dollars far
          more often than in cedis, so a forwarder&apos;s rates are stored exactly as they quoted
          them and converted here. Change a rate and every route priced in that currency moves with
          it — no rate sheet has to be retyped.
        </p>

        <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Currency</th>
                <th className="px-4 py-2.5 font-semibold">1 unit buys</th>
                <th className="px-4 py-2.5 font-semibold">Used by</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {currencies.map((c) => {
                const routes = usage[c.code] ?? 0;
                const home = c.code === HOME_CURRENCY;
                return (
                  <tr key={c.code} className={c.isActive ? "" : "opacity-55"}>
                    <td className="px-4 py-2.5 font-medium text-niki-ink">
                      {c.symbol ? `${c.symbol} ` : ""}
                      {c.code}
                      <span className="block text-xs text-niki-ink/50">{c.name}</span>
                    </td>
                    <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                      {home ? "—" : formatPrice(c.rateToGhs)}
                      {!home && c.rateToGhs === 1 ? (
                        <span className="block font-sans text-xs font-semibold text-niki-danger">
                          Still 1:1 — freight in {c.code} is being quoted at face value
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-niki-ink/70">
                      {routes > 0 ? `${routes} route${routes === 1 ? "" : "s"}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          c.isActive
                            ? "bg-niki-success/10 text-niki-success"
                            : "bg-niki-black/5 text-niki-ink/60"
                        }`}
                      >
                        {c.isActive ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                        >
                          Edit rate
                        </button>
                        {home ? null : (
                          <form action={deleteCurrency}>
                            <input type="hidden" name="code" value={c.code} />
                            <button
                              type="submit"
                              aria-label={`Remove ${c.code}`}
                              className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Keyed on the row being edited so the inputs reset to it rather than
          keeping whatever was typed for the last one. */}
      <form key={key} action={formAction} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge" noValidate>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <RefreshCw className="h-4 w-4 text-niki-orange" />
          {editing ? `Update ${editing.code}` : "Add a currency"}
        </h3>

        {state.error ? (
          <p role="alert" className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
            Saved ✓ Every route quoted in this currency has re-priced.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Code" htmlFor="code" hint="Three letters: USD, CNY, AED.">
            <input
              id="code"
              name="code"
              defaultValue={editing?.code ?? ""}
              readOnly={Boolean(editing)}
              maxLength={3}
              placeholder="USD"
              className={inputClass}
            />
          </Field>
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" defaultValue={editing?.name ?? ""} placeholder="US Dollar" className={inputClass} />
          </Field>
          <Field label="Symbol" htmlFor="symbol">
            <input id="symbol" name="symbol" defaultValue={editing?.symbol ?? ""} placeholder="$" className={inputClass} />
          </Field>
          <Field
            label="Worth in GH₵"
            htmlFor="rateToGhs"
            hint="What one unit buys today."
          >
            <input
              id="rateToGhs"
              name="rateToGhs"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={editing?.rateToGhs ?? ""}
              className={inputClass}
            />
          </Field>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-niki-ink/80">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={editing ? editing.isActive : true}
            className="h-4 w-4 rounded"
          />
          Offer this currency when pricing a forwarder&apos;s route.
        </label>

        <div className="mt-5 flex items-center gap-3">
          <div className="w-44">
            <SubmitButton>{editing ? "Update rate" : "Add currency"}</SubmitButton>
          </div>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
