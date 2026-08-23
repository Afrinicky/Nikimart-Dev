"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/ui/Field";
import { saveShippingRates, type ShippingRatesState } from "@/lib/shipping-rate-actions";

interface Hub {
  id: string;
  name: string;
  locationName: string;
}

const COUNTRIES: { code: string; label: string; key: string }[] = [
  { code: "CN", label: "China", key: "intlRatePerCbmCN" },
  { code: "AE", label: "UAE / Dubai", key: "intlRatePerCbmAE" },
  { code: "US", label: "USA", key: "intlRatePerCbmUS" },
  { code: "EU", label: "Europe", key: "intlRatePerCbmEU" },
];

export function ShippingRatesForm({
  hubs,
  routes,
  settings,
}: {
  hubs: Hub[];
  /** Existing route rates keyed `${originId}|${destId}` → ₵/CBM. */
  routes: Record<string, number>;
  settings: Record<string, string>;
}) {
  const [state, formAction] = useActionState<ShippingRatesState, FormData>(saveShippingRates, {});

  return (
    <form action={formAction} className="space-y-8">
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">Shipping rates saved ✓</p>
      ) : null}

      {/* Global default */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Default rate</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Charged per CBM on any route that doesn&apos;t have a specific rate below. Fee = product CBM × rate.
        </p>
        <label className="mt-4 block max-w-xs">
          <span className="mb-1 block text-sm font-medium text-niki-ink">Default ₵ per CBM</span>
          <input
            name="shippingDefaultRatePerCbm"
            type="number"
            min="0"
            step="0.01"
            defaultValue={settings.shippingDefaultRatePerCbm ?? ""}
            className={inputClass}
          />
        </label>
      </section>

      {/* Domestic route matrix */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Domestic route rates (₵ / CBM)</h2>
        <p className="mt-1 mb-4 text-sm text-niki-ink/60">
          Rows are the seller&apos;s origin hub; columns are the buyer&apos;s pickup point. Same hub → set 0 for
          free collection. Leave a cell blank to fall back to the default rate.
        </p>
        {hubs.length === 0 ? (
          <p className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60">
            Add pickup points first — they are the origin hubs and destinations for routes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                    From ↓ / To →
                  </th>
                  {hubs.map((d) => (
                    <th key={d.id} className="px-2 py-1 text-left text-xs font-semibold text-niki-ink/70">
                      {d.locationName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hubs.map((o) => (
                  <tr key={o.id}>
                    <th className="whitespace-nowrap px-2 py-1 text-left text-xs font-semibold text-niki-ink/70">
                      {o.locationName}
                    </th>
                    {hubs.map((d) => {
                      const key = `${o.id}|${d.id}`;
                      const val = key in routes ? String(routes[key]) : "";
                      return (
                        <td key={d.id} className="px-1 py-1">
                          <input
                            name={`rate::${o.id}::${d.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={val}
                            placeholder={o.id === d.id ? "0" : "—"}
                            className="w-24 rounded-lg border border-niki-edge-strong bg-white px-2 py-1.5 text-sm outline-none focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* International */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Shipped from abroad (₵ / CBM)</h2>
        <p className="mt-1 mb-4 text-sm text-niki-ink/60">
          International freight rate per origin country. Goods land at the arrival hub, then the domestic route
          rate (above) carries them to the buyer&apos;s pickup point.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COUNTRIES.map((c) => (
            <label key={c.code} className="block">
              <span className="mb-1 block text-sm font-medium text-niki-ink">{c.label}</span>
              <input
                name={c.key}
                type="number"
                min="0"
                step="0.01"
                defaultValue={settings[c.key] ?? ""}
                className={inputClass}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-niki-ink">Other countries (default)</span>
            <input
              name="intlDefaultRatePerCbm"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.intlDefaultRatePerCbm ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-niki-ink">Arrival hub (lands here)</span>
            <select
              name="internationalArrivalHubId"
              defaultValue={settings.internationalArrivalHubId ?? ""}
              className={inputClass}
            >
              <option value="">First pickup point</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.locationName} — {h.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <button
        type="submit"
        className="rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
      >
        Save shipping rates
      </button>
    </form>
  );
}
