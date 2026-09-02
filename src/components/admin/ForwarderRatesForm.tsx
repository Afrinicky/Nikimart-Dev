"use client";

import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { deleteForwarderRate, saveForwarderRate, type ShippingState } from "@/lib/shipping-admin-actions";

export interface ForwarderRateRow {
  id: string;
  categoryId: string | null;
  label: string;
  ratePerCbm: number;
  ratePerKg: number;
  minCharge: number;
  transitDays: number;
}

/**
 * A forwarder's price list: one rate per cubic metre, per category.
 *
 * Forwarders quote this way because a cubic metre of clothing and a cubic metre
 * of electronics do not attract the same duty, so the row with no category is
 * the one to set first — it is what everything the forwarder has no specific
 * price for falls back to. A forwarder with only category rows can carry
 * nothing else, which is worth saying on the screen rather than leaving a
 * seller to discover at checkout.
 */
export function ForwarderRatesForm({
  forwarderId,
  rates,
  categories,
  allInclusive,
}: {
  forwarderId: string;
  rates: ForwarderRateRow[];
  categories: { id: string; label: string }[];
  allInclusive: boolean;
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveForwarderRate, {});
  const hasCatchAll = rates.some((r) => !r.categoryId);
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.label ?? "—") : "Everything else";

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="font-display text-lg font-bold text-niki-ink">Price list</h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        What this forwarder charges to bring one cubic metre to Ghana.{" "}
        {allInclusive
          ? "Their rate covers the port fees, duty and taxes, so nothing is added on top of it."
          : "Their rate is carriage only — duty, clearing and Ghana VAT are charged on the landed value on top of it."}
      </p>

      {!hasCatchAll ? (
        <p className="mt-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
          There is no “everything else” price yet, so this forwarder can only carry the categories
          listed below. Add one with the category left as <strong>Everything else</strong>.
        </p>
      ) : null}

      {rates.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 font-semibold">Per CBM</th>
                <th className="px-4 py-2.5 font-semibold">Per kg</th>
                <th className="px-4 py-2.5 font-semibold">Minimum</th>
                <th className="px-4 py-2.5 font-semibold">Transit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {rates.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium text-niki-ink">
                    {categoryName(r.categoryId)}
                    {r.label ? <span className="block text-xs text-niki-ink/45">{r.label}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                    {r.ratePerCbm > 0 ? formatPrice(r.ratePerCbm) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                    {r.ratePerKg > 0 ? formatPrice(r.ratePerKg) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                    {r.minCharge > 0 ? formatPrice(r.minCharge) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-niki-ink/70">{r.transitDays} days</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteForwarderRate}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        aria-label={`Remove the ${categoryName(r.categoryId)} price`}
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
        <p className="mt-5 rounded-xl bg-niki-danger/10 p-4 text-sm font-medium text-niki-danger">
          No prices yet. Until one is set, nothing can be listed against this forwarder — buyers
          would be quoted zero freight on a container somebody still has to pay to move.
        </p>
      )}

      <form action={formAction} className="mt-6 border-t border-niki-edge pt-5" noValidate>
        <input type="hidden" name="forwarderId" value={forwarderId} />
        {state.error ? (
          <p role="alert" className="mb-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
            Price saved ✓
          </p>
        ) : null}

        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-niki-ink/60">
          <Plus className="h-4 w-4 text-niki-orange" />
          Add or update a price
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Category"
            htmlFor="categoryId"
            hint="Leave as “Everything else” for the catch-all price."
          >
            <select id="categoryId" name="categoryId" defaultValue="" className={inputClass}>
              <option value="">Everything else</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Per cubic metre (GH₵)" htmlFor="ratePerCbm" hint="How sea freight is normally sold.">
            <input id="ratePerCbm" name="ratePerCbm" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
          </Field>
          <Field label="Per kilogram (GH₵)" htmlFor="ratePerKg" hint="How air freight is normally sold. Both may be set.">
            <input id="ratePerKg" name="ratePerKg" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
          </Field>
          <Field label="Minimum charge (GH₵)" htmlFor="minCharge" hint="No consignment on this route is billed under this.">
            <input id="minCharge" name="minCharge" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
          </Field>
          <Field label="Transit time (days)" htmlFor="transitDays" hint="Drives the arrival estimate buyers see.">
            <input id="transitDays" name="transitDays" type="number" min="0" defaultValue={21} className={inputClass} />
          </Field>
          <Field label="Label" htmlFor="label" hint="Optional. For your own reference.">
            <input id="label" name="label" defaultValue="" className={inputClass} />
          </Field>
        </div>

        <div className="mt-5 w-44">
          <SubmitButton>Save price</SubmitButton>
        </div>
      </form>
    </div>
  );
}
