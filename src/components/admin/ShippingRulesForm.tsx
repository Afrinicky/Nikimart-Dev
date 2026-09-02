"use client";

import { useActionState, useState } from "react";
import { Plus, Power, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import {
  deleteShippingRule,
  saveShippingRule,
  toggleShippingRule,
  type ShippingState,
} from "@/lib/shipping-admin-actions";

export interface RuleRow {
  id: string;
  originPointId: string | null;
  destPickupId: string | null;
  categoryId: string | null;
  flatFee: number;
  baseFee: number;
  perKgRate: number;
  note: string;
  isActive: boolean;
}

interface Named {
  id: string;
  label: string;
}

/**
 * The rules that price the run inside Ghana.
 *
 * A rule is a scope and a price, and every part of the scope is optional. That
 * is what makes one screen enough: "everything from Kumasi to Accra costs base
 * 25 plus 2 a kilo" and "all blenders from Kumasi to Accra cost 50" are the same
 * kind of statement, written the same way, and the sharper one wins.
 *
 * A matrix was the obvious alternative and the wrong one. It has a cell for
 * every pair whether or not anybody has an opinion about it, no room for a
 * category, and it grows as the square of the network — which is how the
 * previous console ended up being something admins avoided.
 */
export function ShippingRulesForm({
  rules,
  points,
  pickupPoints,
  categories,
  defaults,
}: {
  rules: RuleRow[];
  points: Named[];
  pickupPoints: Named[];
  categories: Named[];
  defaults: { baseFee: number; perKgRate: number; minFee: number };
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingRule, {});
  const [mode, setMode] = useState<"flat" | "weight" | "free">("flat");

  const name = (list: Named[], id: string | null, anyLabel: string) =>
    id ? (list.find((x) => x.id === id)?.label ?? "—") : anyLabel;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Rules</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Read top to bottom, the most specific rule wins. Anything no rule claims is priced by the
          defaults on the Overview screen: {formatPrice(defaults.baseFee)} plus{" "}
          {formatPrice(defaults.perKgRate)} per billable kilogram
          {defaults.minFee > 0 ? `, never under ${formatPrice(defaults.minFee)}` : ""}. Collecting
          where the goods already sit is always free, rule or no rule.
        </p>

        {rules.length === 0 ? (
          <p className="mt-5 rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60">
            No rules yet — every route is priced by the defaults. That is a perfectly good place to
            start; add a rule when one route or one kind of goods needs its own price.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">From</th>
                  <th className="px-4 py-2.5 font-semibold">To</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 font-semibold">Price</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {rules.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 font-medium text-niki-ink">
                      {name(points, r.originPointId, "Any point")}
                    </td>
                    <td className="px-4 py-2.5 text-niki-ink/75">
                      {name(pickupPoints, r.destPickupId, "Any station")}
                    </td>
                    <td className="px-4 py-2.5 text-niki-ink/75">
                      {name(categories, r.categoryId, "Any category")}
                    </td>
                    <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                      {r.flatFee > 0 ? (
                        <>
                          {formatPrice(r.flatFee)}{" "}
                          <span className="font-sans text-xs text-niki-ink/50">per item</span>
                        </>
                      ) : r.baseFee > 0 || r.perKgRate > 0 ? (
                        <>
                          {formatPrice(r.baseFee)}{" "}
                          <span className="font-sans text-xs text-niki-ink/50">
                            + {formatPrice(r.perKgRate)}/kg
                          </span>
                        </>
                      ) : (
                        <span className="font-sans text-xs font-semibold text-niki-success">Free</span>
                      )}
                      {r.note ? (
                        <span className="block font-sans text-xs text-niki-ink/45">{r.note}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <form action={toggleShippingRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            title={r.isActive ? "Pause this rule" : "Resume this rule"}
                            className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-black/5 hover:text-niki-ink"
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </form>
                        <form action={deleteShippingRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            aria-label="Remove this rule"
                            className="rounded-lg p-1.5 text-niki-ink/50 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form action={formAction} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge" noValidate>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Plus className="h-4 w-4 text-niki-orange" />
          Add or update a rule
        </h3>
        <p className="mt-1 text-sm text-niki-ink/60">
          Saving a rule whose scope already exists replaces it, so correcting a price never leaves
          two rules arguing about the same route.
        </p>

        {state.error ? (
          <p role="alert" className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
            Rule saved ✓
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="From" htmlFor="originPointId" hint="The consolidation point the goods leave.">
            <select id="originPointId" name="originPointId" defaultValue="" className={inputClass}>
              <option value="">Any point</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To" htmlFor="destPickupId" hint="The pickup station the buyer collects from.">
            <select id="destPickupId" name="destPickupId" defaultValue="" className={inputClass}>
              <option value="">Any station</option>
              {pickupPoints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="categoryId" hint="Narrow the rule to one kind of goods.">
            <select id="categoryId" name="categoryId" defaultValue="" className={inputClass}>
              <option value="">Any category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-niki-ink">How is it priced?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["flat", "A flat fee per item"],
                ["weight", "By weight"],
                ["free", "Free"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  mode === value
                    ? "bg-niki-black text-white"
                    : "bg-niki-surface text-niki-ink/70 hover:text-niki-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "flat" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Fee per item (GH₵)"
              htmlFor="flatFee"
              hint="Charged once per unit, whatever it weighs. This is the “all blenders from Kumasi to Accra cost 50” rule."
            >
              <input id="flatFee" name="flatFee" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
            </Field>
          </div>
        ) : null}

        {mode === "weight" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Base fee (GH₵)" htmlFor="baseFee" hint="Charged once per consignment on this route.">
              <input id="baseFee" name="baseFee" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
            </Field>
            <Field label="Per kilogram (GH₵)" htmlFor="perKgRate" hint="On the billable weight — the greater of actual and volumetric.">
              <input id="perKgRate" name="perKgRate" type="number" min="0" step="0.01" defaultValue="" className={inputClass} />
            </Field>
          </div>
        ) : null}

        {mode === "free" ? (
          <>
            {/* An explicit zero, so a free route is a decision rather than three
                boxes somebody forgot to fill in. */}
            <input type="hidden" name="allowZero" value="1" />
            <p className="mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm text-niki-success">
              Nothing is charged on this route. Sellers still see the item priced normally; the
              shipping line simply reads free.
            </p>
          </>
        ) : null}

        <div className="mt-4">
          <Field label="Note" htmlFor="note" hint="For your own reference. Not shown to buyers.">
            <input id="note" name="note" defaultValue="" className={inputClass} />
          </Field>
        </div>

        <div className="mt-5 w-44">
          <SubmitButton>Save rule</SubmitButton>
        </div>
      </form>
    </div>
  );
}
