"use client";

import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FREIGHT_MODES, FREIGHT_MODE_LABELS } from "@/lib/abroad";
import { ANY } from "@/lib/arrival-points";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import { deleteArrivalRate, saveArrivalRate } from "@/lib/arrival-point-actions";
import type { CrudState } from "@/lib/admin-actions";

export interface RateRow {
  id: string;
  originCountry: string;
  mode: string;
  ratePerCbm: number;
  ratePerKg: number;
  minCharge: number;
  transitDays: number;
}

/**
 * The rate table for one arrival point: what each origin costs, by each mode.
 *
 * Two axes rather than one because the two prices are unrelated. Sea freight
 * from China is sold by the cubic metre; air freight from Dubai is sold by the
 * kilo; a row can carry both and `minCharge` floors the sum, which is how
 * forwarders actually quote. A wildcard row ("Any origin", "Any mode") is the
 * catch-all a point falls back to, so an admin can price a whole point in one
 * row and refine it later without leaving buyers unquotable in between.
 */
export function ArrivalRatesForm({ arrivalPointId, rates }: { arrivalPointId: string; rates: RateRow[] }) {
  const [state, formAction] = useActionState<CrudState, FormData>(saveArrivalRate, {});

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="font-display text-lg font-bold text-niki-ink">Freight rates into this point</h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        Leg 2 of every shipped-from-abroad order that lands here. Set a rate per CBM (how sea freight
        is sold), a rate per kg (how air freight is sold), or both — the minimum charge is the floor
        under the sum. A listing whose origin and mode match no row here can&apos;t be quoted, and
        buyers are told so rather than charged nothing.
      </p>

      {rates.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Origin</th>
                <th className="px-4 py-2.5 font-semibold">Mode</th>
                <th className="px-4 py-2.5 font-semibold">₵ / CBM</th>
                <th className="px-4 py-2.5 font-semibold">₵ / kg</th>
                <th className="px-4 py-2.5 font-semibold">Minimum</th>
                <th className="px-4 py-2.5 font-semibold">Transit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {rates.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium text-niki-ink">
                    {r.originCountry === ANY ? "Any origin" : r.originCountry}
                  </td>
                  <td className="px-4 py-2.5 text-niki-ink/70">
                    {r.mode === ANY
                      ? "Any mode"
                      : (FREIGHT_MODE_LABELS[r.mode as keyof typeof FREIGHT_MODE_LABELS] ?? r.mode)}
                  </td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">{r.ratePerCbm.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">{r.ratePerKg.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">{r.minCharge.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-niki-ink/70">{r.transitDays} days</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteArrivalRate}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        aria-label={`Remove the ${r.originCountry} ${r.mode} rate`}
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
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-niki-gold/10 p-4 text-sm text-amber-900">
          No rates yet. Until at least one is set, sellers can&apos;t list anything landing here
          unless they enter their own leg-2 cost or their price already includes freight.
        </p>
      )}

      <form action={formAction} className="mt-6 border-t border-niki-edge pt-5" noValidate>
        <input type="hidden" name="arrivalPointId" value={arrivalPointId} />
        {state.error ? (
          <p role="alert" className="mb-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {state.error}
          </p>
        ) : null}

        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-niki-ink/60">
          <Plus className="h-4 w-4 text-niki-orange" />
          Add or update a rate
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Origin" htmlFor="originCountry">
            <select id="originCountry" name="originCountry" defaultValue={ANY} className={inputClass}>
              <option value={ANY}>Any origin</option>
              {FOREIGN_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Freight mode" htmlFor="mode">
            <select id="mode" name="mode" defaultValue="sea" className={inputClass}>
              <option value={ANY}>Any mode</option>
              {FREIGHT_MODES.map((m) => (
                <option key={m} value={m}>
                  {FREIGHT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transit time (days)" htmlFor="transitDays" hint="Drives the arrival estimate buyers see.">
            <input id="transitDays" name="transitDays" type="number" min="0" defaultValue={21} className={inputClass} />
          </Field>
          <Field label="Rate per CBM (GH₵)" htmlFor="ratePerCbm" hint="How sea freight is normally sold.">
            <input id="ratePerCbm" name="ratePerCbm" type="number" min="0" step="0.01" defaultValue={0} className={inputClass} />
          </Field>
          <Field label="Rate per kg (GH₵)" htmlFor="ratePerKg" hint="How air freight is normally sold.">
            <input id="ratePerKg" name="ratePerKg" type="number" min="0" step="0.01" defaultValue={0} className={inputClass} />
          </Field>
          <Field label="Minimum charge (GH₵)" htmlFor="minCharge" hint="No consignment on this route is billed under this.">
            <input id="minCharge" name="minCharge" type="number" min="0" step="0.01" defaultValue={0} className={inputClass} />
          </Field>
        </div>

        <div className="mt-5 w-48">
          <SubmitButton>Save rate</SubmitButton>
        </div>
      </form>
    </div>
  );
}
