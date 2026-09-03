"use client";

import { useActionState, useState } from "react";
import { Clock, Plus, Power, Route as RouteIcon, Star, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { FREIGHT_MODES, FREIGHT_MODE_LABELS } from "@/lib/abroad";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import { describeRoute, describeTransit, type ForwarderRoute, type GoodsClass } from "@/lib/shipping";
import {
  deleteRoute,
  deleteRouteRate,
  saveRoute,
  saveRouteRate,
  toggleRoute,
  type ShippingState,
} from "@/lib/shipping-admin-actions";

/**
 * A forwarder's lanes, and what each of them costs.
 *
 * This is the shape a real quote sheet has, and the reason the flat price list
 * it replaces could never hold one. CSL Imports do not have "a rate": they have
 * China → Accra by sea at $260 for normal goods, $280 for special and $300 for
 * heavy-duty; China → Kumasi at $280, $285 and $350; and an air lane that is a
 * different price and a different wait entirely. Every one of those numbers
 * differs by lane, by class, or by both.
 *
 * The transit window is on the lane rather than in a setting because it is half
 * of what a buyer is choosing: 7–14 days by air against 35–45 by sea is the
 * whole decision, and a price without it is not an offer.
 */
export function ForwarderRoutesForm({
  forwarderId,
  routes,
  classes,
  points,
  currencies,
  defaultCurrency,
  rateToGhs,
}: {
  forwarderId: string;
  routes: ForwarderRoute[];
  classes: GoodsClass[];
  points: { id: string; label: string }[];
  currencies: { code: string; name: string; symbol: string }[];
  defaultCurrency: string;
  /** code → GH₵ per unit, so a rate can be shown in cedis as it is typed. */
  rateToGhs: Record<string, number>;
}) {
  const [routeState, saveRouteAction] = useActionState<ShippingState, FormData>(saveRoute, {});
  const [rateState, saveRateAction] = useActionState<ShippingState, FormData>(saveRouteRate, {});
  const [editing, setEditing] = useState<ForwarderRoute | null>(null);
  const [pricing, setPricing] = useState<ForwarderRoute | null>(null);

  const pointName = (id: string | null) =>
    (id && points.find((p) => p.id === id)?.label) || "";
  const symbol = (code: string) =>
    currencies.find((c) => c.code === code)?.symbol || code;
  const inGhs = (amount: number, code: string) => amount * (rateToGhs[code] || 1);
  const className = (id: string | null) =>
    id ? (classes.find((c) => c.id === id)?.name ?? "—") : "Everything else";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <RouteIcon className="h-5 w-5 text-niki-orange" />
          Their routes
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          One row per lane they sell: where it collects, how it travels, which Ghana point it lands
          at, and how long it takes. Buyers pick between them at checkout, so add every lane you
          want offered — and mark one the default, which is what a listing is quoted on until a
          buyer chooses.
        </p>

        {routes.length === 0 ? (
          <p className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            No routes yet, so this forwarder cannot quote anything and listings assigned to them
            can&apos;t be bought. Add their first lane below.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {routes.map((r) => {
              const code = r.currency || defaultCurrency;
              return (
                <div
                  key={r.id}
                  className={`rounded-xl ring-1 ring-niki-edge ${r.isActive ? "" : "opacity-55"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-niki-edge px-4 py-3">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-niki-ink">
                        {describeRoute(r, pointName(r.destinationPointId))}
                        {r.isDefault ? (
                          <span className="flex items-center gap-1 rounded-full bg-niki-orange/10 px-2 py-0.5 text-xs font-semibold text-niki-orange">
                            <Star className="h-3 w-3" /> Default
                          </span>
                        ) : null}
                        {r.isActive ? null : (
                          <span className="rounded-full bg-niki-black/5 px-2 py-0.5 text-xs font-semibold text-niki-ink/60">
                            Paused
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-niki-ink/55">
                        <span>{FREIGHT_MODE_LABELS[r.mode as keyof typeof FREIGHT_MODE_LABELS] ?? r.mode}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {describeTransit(r.minDays, r.maxDays)}
                        </span>
                        <span>Quoted in {code}</span>
                        {r.note ? <span>{r.note}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPricing(pricing?.id === r.id ? null : r)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                      >
                        {pricing?.id === r.id ? "Close prices" : "Add a price"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                      >
                        Edit
                      </button>
                      <form action={toggleRoute}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          title={r.isActive ? "Pause this route" : "Resume this route"}
                          className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-black/5 hover:text-niki-ink"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </form>
                      <form action={deleteRoute}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          aria-label="Remove this route"
                          className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>

                  {r.rates.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-niki-danger">
                      No prices on this lane yet — nothing can travel on it.
                    </p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-niki-ink/45">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Class</th>
                          <th className="px-4 py-2 font-semibold">Per CBM</th>
                          <th className="px-4 py-2 font-semibold">Per kg</th>
                          <th className="px-4 py-2 font-semibold">Minimum</th>
                          <th className="px-4 py-2 text-right font-semibold" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-niki-edge">
                        {r.rates.map((rate) => (
                          <tr key={rate.id}>
                            <td className="px-4 py-2 font-medium text-niki-ink">
                              {className(rate.goodsClassId)}
                              {rate.note ? (
                                <span className="block text-xs text-niki-ink/50">{rate.note}</span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 font-figures text-niki-ink/80">
                              {rate.ratePerCbm > 0 ? (
                                <>
                                  {symbol(code)}
                                  {rate.ratePerCbm}
                                  <span className="block font-sans text-xs text-niki-ink/45">
                                    ≈ {formatPrice(inGhs(rate.ratePerCbm, code))}
                                    {rate.minCbm > 0 ? ` · min ${rate.minCbm} m³` : ""}
                                  </span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2 font-figures text-niki-ink/80">
                              {rate.ratePerKg > 0 ? `${symbol(code)}${rate.ratePerKg}` : "—"}
                            </td>
                            <td className="px-4 py-2 font-figures text-niki-ink/80">
                              {rate.minCharge > 0 ? `${symbol(code)}${rate.minCharge}` : "—"}
                            </td>
                            <td className="px-4 py-2">
                              <form action={deleteRouteRate} className="flex justify-end">
                                <input type="hidden" name="id" value={rate.id} />
                                <button
                                  type="submit"
                                  aria-label="Remove this price"
                                  className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {pricing?.id === r.id ? (
                    <form
                      action={saveRateAction}
                      className="border-t border-niki-edge bg-niki-surface px-4 py-4"
                      noValidate
                    >
                      <input type="hidden" name="routeId" value={r.id} />
                      <p className="text-sm font-semibold text-niki-ink">
                        Price for {describeRoute(r, pointName(r.destinationPointId))}
                      </p>
                      {rateState.error ? (
                        <p role="alert" className="mt-2 rounded-lg bg-niki-danger/10 px-3 py-2 text-sm font-medium text-niki-danger">
                          {rateState.error}
                        </p>
                      ) : null}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Field label="Class" htmlFor={`gc-${r.id}`}>
                          <select id={`gc-${r.id}`} name="goodsClassId" defaultValue="" className={inputClass}>
                            <option value="">Everything else</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={`Per CBM (${code})`} htmlFor={`cbm-${r.id}`}>
                          <input id={`cbm-${r.id}`} name="ratePerCbm" type="number" min="0" step="0.01" className={inputClass} />
                        </Field>
                        <Field label={`Per kg (${code})`} htmlFor={`kg-${r.id}`} hint="For air freight.">
                          <input id={`kg-${r.id}`} name="ratePerKg" type="number" min="0" step="0.01" className={inputClass} />
                        </Field>
                        <Field
                          label="Minimum CBM"
                          htmlFor={`mincbm-${r.id}`}
                          hint="“Under 1 CBM still bills as one.” Usually 1 for sea."
                        >
                          <input id={`mincbm-${r.id}`} name="minCbm" type="number" min="0" step="0.01" className={inputClass} />
                        </Field>
                        <Field label={`Minimum charge (${code})`} htmlFor={`min-${r.id}`}>
                          <input id={`min-${r.id}`} name="minCharge" type="number" min="0" step="0.01" className={inputClass} />
                        </Field>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="Note" htmlFor={`note-${r.id}`} hint="For your own reference.">
                          <input id={`note-${r.id}`} name="note" className={inputClass} />
                        </Field>
                      </div>
                      <div className="mt-4 w-40">
                        <SubmitButton>Save price</SubmitButton>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Keyed on the route being edited so the inputs reset to it. */}
      <form
        key={editing?.id ?? "new-route"}
        action={saveRouteAction}
        className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge"
        noValidate
      >
        <input type="hidden" name="forwarderId" value={forwarderId} />
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Plus className="h-4 w-4 text-niki-orange" />
          {editing ? "Edit route" : "Add a route"}
        </h3>

        {routeState.error ? (
          <p role="alert" className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {routeState.error}
          </p>
        ) : null}
        {routeState.ok ? (
          <p className="mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
            Route saved ✓ Now give it a price for each class of goods.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Name"
            htmlFor="routeName"
            hint="What buyers see. Left blank, it is built from the origin and the destination."
          >
            <input
              id="routeName"
              name="name"
              defaultValue={editing?.name ?? ""}
              placeholder="China → Accra (Sea)"
              className={inputClass}
            />
          </Field>
          <Field label="Collects in" htmlFor="routeOriginCountry">
            <select
              id="routeOriginCountry"
              name="originCountry"
              defaultValue={editing?.originCountry ?? ""}
              className={inputClass}
            >
              <option value="">Any country</option>
              {FOREIGN_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Collection city" htmlFor="routeOriginCity" hint="Optional. Guangzhou, Yiwu, Dubai.">
            <input
              id="routeOriginCity"
              name="originCity"
              defaultValue={editing?.originCity ?? ""}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="How it travels" htmlFor="routeMode">
            <select id="routeMode" name="mode" defaultValue={editing?.mode ?? "sea"} className={inputClass}>
              {FREIGHT_MODES.map((m) => (
                <option key={m} value={m}>
                  {FREIGHT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Lands at"
            htmlFor="destinationPointId"
            hint="Their Ghana consolidation point on this lane. The local run starts there."
          >
            <select
              id="destinationPointId"
              name="destinationPointId"
              defaultValue={editing?.destinationPointId ?? ""}
              className={inputClass}
            >
              <option value="">Their usual point</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quoted in" htmlFor="routeCurrency" hint="Converted at the rate on the Currencies screen.">
            <select
              id="routeCurrency"
              name="currency"
              defaultValue={editing?.currency ?? defaultCurrency}
              className={inputClass}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol ? `${c.symbol} ` : ""}
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Fastest (days)" htmlFor="minDays" hint="The near end of the window buyers see.">
            <input
              id="minDays"
              name="minDays"
              type="number"
              min="0"
              step="1"
              defaultValue={editing?.minDays ?? 35}
              className={inputClass}
            />
          </Field>
          <Field label="Slowest (days)" htmlFor="maxDays" hint="The date the arrival estimate is built from.">
            <input
              id="maxDays"
              name="maxDays"
              type="number"
              min="0"
              step="1"
              defaultValue={editing?.maxDays ?? 45}
              className={inputClass}
            />
          </Field>
          <Field label="Note" htmlFor="routeNote" hint="Shown beside the option at checkout.">
            <input id="routeNote" name="note" defaultValue={editing?.note ?? ""} className={inputClass} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-niki-ink/80">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={editing?.isActive ?? true}
              className="h-4 w-4 rounded"
            />
            Offer this route to buyers
          </label>
          <label className="flex items-center gap-2 text-sm text-niki-ink/80">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={editing?.isDefault ?? routes.length === 0}
              className="h-4 w-4 rounded"
            />
            The default — what a listing is quoted on before a buyer chooses
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="w-40">
            <SubmitButton>{editing ? "Save route" : "Add route"}</SubmitButton>
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
