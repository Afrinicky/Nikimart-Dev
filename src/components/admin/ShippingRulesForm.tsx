"use client";

import { useActionState, useState } from "react";
import { Plus, Power, Trash2, Truck } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { FormFeedback } from "@/components/ui/FormFeedback";
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
  baseFee: number;
  perUnitFee: number;
  flatFee: number;
  perKgRate: number;
  note: string;
  isActive: boolean;
}

interface Named {
  id: string;
  label: string;
}

/** What a rule actually charges, legacy columns reconciled. */
function effective(r: RuleRow): { base: number; increment: number; legacy: boolean } {
  const base = r.baseFee > 0 ? r.baseFee : r.flatFee;
  const increment = r.perUnitFee > 0 ? r.perUnitFee : 0;
  return { base, increment, legacy: r.baseFee === 0 && r.flatFee > 0 };
}

/**
 * The rules that price the run inside Ghana.
 *
 * There is one shape of price now and it is the shape a courier quotes: a base
 * fee for the consignment, and a small amount for every item after the first.
 * The three modes this screen used to offer — flat per item, by weight, free —
 * were three ways of asking the same question, and the first of them was
 * actively wrong: a flat fee per item meant ten bottles of spray cost ten
 * delivery fees for one parcel on one van.
 *
 * A rule is that price plus a scope, and every part of the scope is optional,
 * which is what makes one screen enough: "anything from Kumasi to Accra" and
 * "fridges, anywhere" are the same kind of statement, written the same way, and
 * the sharper one wins.
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
  defaults: { baseFee: number; perUnitFee: number; minFee: number };
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingRule, {});
  const [free, setFree] = useState(false);
  const [base, setBase] = useState(defaults.baseFee);
  const [increment, setIncrement] = useState(defaults.perUnitFee);
  const [sampleUnits, setSampleUnits] = useState(10);

  const name = (list: Named[], id: string | null, anyLabel: string) =>
    id ? (list.find((x) => x.id === id)?.label ?? "—") : anyLabel;

  const sampleFee = free ? 0 : Math.max(base + increment * Math.max(0, sampleUnits - 1), defaults.minFee);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-niki-black p-6 text-white">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Truck className="h-5 w-5 text-niki-orange" />
          How the run inside Ghana is priced
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/75">
          One seller&apos;s goods are one consignment: one pickup, one van, one handover. So the
          base fee is charged <span className="font-semibold text-white">once per seller</span>, and
          every item after the first adds only the increment. Ten bottles of spray from one shop are
          one delivery, not ten. Two shops in the same cart are two deliveries, and two base fees.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">
          Collecting where the goods already sit is always free — rule or no rule.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Rules</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The most specific rule wins. Anything no rule claims is priced by the defaults on the
          Overview screen: {formatPrice(defaults.baseFee)} for the first item, then{" "}
          {formatPrice(defaults.perUnitFee)} each
          {defaults.minFee > 0 ? `, never under ${formatPrice(defaults.minFee)}` : ""}.
        </p>

        {rules.length === 0 ? (
          <p className="mt-5 rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60">
            No rules yet — every route is priced by the defaults. That is a perfectly good place to
            start; add a rule when one route or one kind of goods needs its own price.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">From</th>
                  <th className="px-4 py-2.5 font-semibold">To</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 font-semibold">First item</th>
                  <th className="px-4 py-2.5 font-semibold">Each extra</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {rules.map((r) => {
                  const { base: b, increment: inc, legacy } = effective(r);
                  return (
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
                        {b > 0 ? (
                          formatPrice(b)
                        ) : (
                          <span className="font-sans text-xs font-semibold text-niki-success">Free</span>
                        )}
                        {legacy ? (
                          <span className="block font-sans text-xs text-niki-ink/45">
                            was a flat per-item fee — now the base
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                        {inc > 0 ? (
                          formatPrice(inc)
                        ) : r.perKgRate > 0 ? (
                          <span className="font-sans text-xs text-niki-ink/60">
                            {formatPrice(r.perKgRate)} per kg of each extra item
                          </span>
                        ) : (
                          <span className="font-sans text-xs text-niki-ink/45">Nothing</span>
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
                  );
                })}
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

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="From"
            htmlFor="originPointId"
            hint="The consolidation point the goods leave — ours, or a forwarder's Ghana warehouse once an imported consignment has landed there."
          >
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

        <label className="mt-5 flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span className="text-sm text-niki-ink/80">
            <span className="font-medium text-niki-ink">Free route.</span> Nothing is charged for
            this journey. Sellers still see the item priced normally; the shipping line reads free.
          </span>
        </label>
        {/* An explicit zero, so a free route is a decision rather than two boxes
            somebody forgot to fill in. */}
        {free ? <input type="hidden" name="allowZero" value="1" /> : null}

        {free ? (
          <>
            <input type="hidden" name="baseFee" value="0" />
            <input type="hidden" name="perUnitFee" value="0" />
          </>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="First item (GH₵)"
              htmlFor="baseFee"
              hint="The base fee, charged once per seller on this route."
            >
              <input
                id="baseFee"
                name="baseFee"
                type="number"
                min="0"
                step="0.01"
                value={base || ""}
                onChange={(e) => setBase(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
            <Field
              label="Each additional item (GH₵)"
              htmlFor="perUnitFee"
              hint="The weight-and-volume increment for every unit after the first."
            >
              <input
                id="perUnitFee"
                name="perUnitFee"
                type="number"
                min="0"
                step="0.01"
                value={increment || ""}
                onChange={(e) => setIncrement(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* The calculator. Not submitted — it only shows what the numbers do. */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/75 ring-1 ring-niki-edge">
          <label className="flex items-center gap-2">
            A buyer ordering
            <input
              type="number"
              min={1}
              value={sampleUnits || ""}
              onChange={(e) => setSampleUnits(Number(e.target.value) || 1)}
              className="w-20 rounded-lg border border-niki-edge-strong bg-white px-2 py-1 font-figures text-sm outline-none focus:border-niki-orange"
            />
            items from one seller pays
          </label>
          <span className="font-figures text-base font-bold text-niki-ink">
            {sampleFee === 0 ? "Free" : formatPrice(sampleFee)}
          </span>
          <span className="text-xs text-niki-ink/50">
            {free ? "" : `${formatPrice(base)} + ${Math.max(0, sampleUnits - 1)} × ${formatPrice(increment)}`}
          </span>
        </div>

        <div className="mt-4">
          <Field label="Note" htmlFor="note" hint="For your own reference. Not shown to buyers.">
            <input id="note" name="note" defaultValue="" className={inputClass} />
          </Field>
        </div>

        <FormFeedback error={state.error} success={state.ok ? "Rule saved ✓" : undefined} />
        <div className="mt-5 w-44">
          <SubmitButton>Save rule</SubmitButton>
        </div>
      </form>
    </div>
  );
}
