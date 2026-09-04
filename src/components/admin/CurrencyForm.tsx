"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { Coins, RefreshCw, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { HOME_CURRENCY, type Currency } from "@/lib/shipping";
import {
  deleteCurrency,
  refreshRatesNow,
  saveCurrency,
  toggleCurrencyAuto,
  type ShippingState,
} from "@/lib/shipping-admin-actions";

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
  lastRefresh,
}: {
  currencies: Currency[];
  /** Currency code → how many routes quote in it. */
  usage: Record<string, number>;
  /** When a fetched rate was last written. Null = none ever were. */
  lastRefresh: string;
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveCurrency, {});
  const [refreshState, refreshAction] = useActionState<ShippingState, FormData>(refreshRatesNow, {});
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
          them and converted here — no rate sheet is ever retyped when the cedi moves.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-niki-ink/60">
          These are fetched every morning and applied to every listing at once. Pin one by hand
          when you have a reason to hold it — a contracted rate — and the refresh leaves it alone.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={refreshAction}>
            <RefreshButton />
          </form>
          <span className="text-xs text-niki-ink/50">
            {lastRefresh ? `Rates last fetched ${lastRefresh}.` : "No rates have been fetched yet."}
          </span>
        </div>

        <FormFeedback
          className="mt-3"
          error={refreshState.error ? `${refreshState.error} The rates below are unchanged.` : undefined}
          success={refreshState.ok ? refreshState.message : undefined}
        />

        <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Currency</th>
                <th className="px-4 py-2.5 font-semibold">1 unit buys</th>
                <th className="px-4 py-2.5 font-semibold">Used by</th>
                <th className="px-4 py-2.5 font-semibold">Rate from</th>
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
                      {home ? (
                        <span className="text-xs text-niki-ink/40">The home currency</span>
                      ) : (
                        <form action={toggleCurrencyAuto}>
                          <input type="hidden" name="code" value={c.code} />
                          <button
                            type="submit"
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                              c.autoUpdate
                                ? "bg-niki-trust/10 text-niki-trust hover:bg-niki-trust/20"
                                : "bg-niki-gold/20 text-amber-900 hover:bg-niki-gold/30"
                            }`}
                            title={
                              c.autoUpdate
                                ? "Fetched every morning. Click to pin it by hand."
                                : "Held by hand. Click to let the morning refresh set it."
                            }
                          >
                            {c.autoUpdate ? "Fetched daily" : "Pinned by hand"}
                          </button>
                        </form>
                      )}
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

        <label className="mt-3 flex items-start gap-3 text-sm text-niki-ink/80">
          <input
            type="checkbox"
            name="autoUpdate"
            defaultChecked={editing ? editing.autoUpdate : true}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span>
            Keep this rate current automatically.{" "}
            <span className="text-niki-ink/55">
              Leave it off to hold the figure above — the morning refresh will not touch it.
            </span>
          </span>
        </label>

        <FormFeedback
          className="mt-5"
          error={state.error}
          success={
            state.ok
              ? (state.message ?? "Saved ✓ Every route quoted in this currency has re-priced.")
              : undefined
          }
        />

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

/**
 * The refresh control, separate so it can read its own form's pending state.
 *
 * Fetching takes a second or two against somebody else's service, and a button
 * that looks idle while it waits invites a second click and a second fetch.
 */
function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-black/85 disabled:opacity-60"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Fetching…" : "Fetch today's rates"}
    </button>
  );
}
