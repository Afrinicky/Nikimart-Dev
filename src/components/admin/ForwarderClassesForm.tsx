"use client";

import { useActionState, useState } from "react";
import { Layers, Plus, Star, Tags, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { GoodsClass } from "@/lib/shipping";
import {
  deleteGoodsClass,
  saveCategoryMap,
  saveGoodsClass,
  type ShippingState,
} from "@/lib/shipping-admin-actions";

/**
 * A forwarder's own classes of goods, and our categories mapped onto them.
 *
 * This is the piece that used to be missing, and its absence is why the
 * previous price list could not describe a real quote sheet. A forwarder prices
 * a container by what is in it — normal, special, heavy-duty — and those words
 * are theirs, not ours. No amount of renaming a storefront category makes
 * "Fashion" a thing a shipping line quotes.
 *
 * So: the forwarder writes their classes here, and every one of our categories
 * is placed in one of them. A class can also carry a levy per cubic metre — the
 * energy commission on appliances, the FDA charge on diapers and wigs — which
 * rides along whichever route the goods travel on, because that is how those
 * charges actually work.
 */
export function ForwarderClassesForm({
  forwarderId,
  classes,
  categories,
  categoryMap,
  currencySymbol,
}: {
  forwarderId: string;
  classes: GoodsClass[];
  categories: { id: string; label: string }[];
  /** Our category id → their class id. */
  categoryMap: Record<string, string>;
  currencySymbol: string;
}) {
  const [classState, saveClass] = useActionState<ShippingState, FormData>(saveGoodsClass, {});
  const [mapState, saveMap] = useActionState<ShippingState, FormData>(saveCategoryMap, {});
  const [editing, setEditing] = useState<GoodsClass | null>(null);

  const fallback = classes.find((c) => c.isDefault) ?? classes[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Layers className="h-5 w-5 text-niki-orange" />
          Their classes of goods
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          Copy these straight off the forwarder&apos;s quote sheet — Normal Goods, Special Goods,
          Heavy-Duty. They are priced per route below. A class may also carry a levy per cubic metre
          that applies wherever it travels.
        </p>

        {classes.length === 0 ? (
          <p className="mt-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">
            No classes yet. Add at least one and mark it the default, or every category will be
            quoted at the route&apos;s catch-all price.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-niki-edge">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Class</th>
                  <th className="px-4 py-2.5 font-semibold">Levy per CBM</th>
                  <th className="px-4 py-2.5 font-semibold">Our categories</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {classes.map((c) => {
                  const mapped = categories.filter((cat) => categoryMap[cat.id] === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-medium text-niki-ink">
                        <span className="flex items-center gap-1.5">
                          {c.name}
                          {c.isDefault ? (
                            <span
                              title="Everything with no class of its own is quoted here"
                              className="flex items-center gap-1 rounded-full bg-niki-orange/10 px-2 py-0.5 text-xs font-semibold text-niki-orange"
                            >
                              <Star className="h-3 w-3" /> Default
                            </span>
                          ) : null}
                        </span>
                        {c.note ? (
                          <span className="block text-xs text-niki-ink/50">{c.note}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-figures text-niki-ink/80">
                        {c.surchargePerCbm > 0 ? (
                          <>
                            {currencySymbol}
                            {c.surchargePerCbm}
                            <span className="block font-sans text-xs text-niki-ink/50">
                              {c.surchargeLabel || "Levy"}
                            </span>
                          </>
                        ) : (
                          <span className="font-sans text-xs text-niki-ink/45">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-niki-ink/70">
                        {mapped > 0
                          ? `${mapped} mapped`
                          : c.isDefault
                            ? "Everything else"
                            : "None yet"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(c)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                          >
                            Edit
                          </button>
                          <form action={deleteGoodsClass}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              aria-label={`Remove ${c.name}`}
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

        {/* Keyed on the row being edited so the inputs reset to it. */}
        <form key={editing?.id ?? "new-class"} action={saveClass} className="mt-6 border-t border-niki-edge pt-5" noValidate>
          <input type="hidden" name="forwarderId" value={forwarderId} />
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-niki-ink/60">
            <Plus className="h-4 w-4 text-niki-orange" />
            {editing ? `Edit ${editing.name}` : "Add a class"}
          </h3>

          {classState.error ? (
            <p role="alert" className="mt-3 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
              {classState.error}
            </p>
          ) : null}
          {classState.ok ? (
            <p className="mt-3 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
              Saved ✓
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" htmlFor="className" hint="As the forwarder writes it.">
              <input
                id="className"
                name="name"
                defaultValue={editing?.name ?? ""}
                placeholder="Normal Goods"
                className={inputClass}
              />
            </Field>
            <Field
              label={`Levy per CBM (${currencySymbol})`}
              htmlFor="surchargePerCbm"
              hint="A charge that rides on this class whatever the route. 0 for none."
            >
              <input
                id="surchargePerCbm"
                name="surchargePerCbm"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.surchargePerCbm || ""}
                className={inputClass}
              />
            </Field>
            <Field label="What the levy is" htmlFor="surchargeLabel">
              <input
                id="surchargeLabel"
                name="surchargeLabel"
                defaultValue={editing?.surchargeLabel ?? ""}
                placeholder="Energy commission"
                className={inputClass}
              />
            </Field>
            <Field label="Order" htmlFor="sortOrder" hint="Where it sits in the list.">
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min="0"
                step="1"
                defaultValue={editing?.sortOrder ?? classes.length}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Note" htmlFor="classNote" hint="What belongs in this class. Sellers may read it.">
              <input
                id="classNote"
                name="note"
                defaultValue={editing?.note ?? ""}
                placeholder="Fridges, freezers, washing machines"
                className={inputClass}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={editing?.isDefault ?? classes.length === 0}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span className="text-sm text-niki-ink/80">
              <span className="font-medium text-niki-ink">The default class.</span> Any category
              nobody has placed is quoted here. Exactly one class holds this.
            </span>
          </label>

          <div className="mt-5 flex items-center gap-3">
            <div className="w-40">
              <SubmitButton>{editing ? "Save class" : "Add class"}</SubmitButton>
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
      </section>

      {classes.length > 0 ? (
        <form action={saveMap} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <input type="hidden" name="forwarderId" value={forwarderId} />
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
            <Tags className="h-5 w-5 text-niki-orange" />
            Which of our categories is which of theirs
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
            Set this once and every listing in a category is quoted at the right rate for the rest
            of its life. Anything left unset falls into{" "}
            <span className="font-medium text-niki-ink">{fallback?.name ?? "their default class"}</span>.
          </p>

          {mapState.error ? (
            <p role="alert" className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
              {mapState.error}
            </p>
          ) : null}
          {mapState.ok ? (
            <p className="mt-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
              Mapping saved ✓
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <label key={cat.id} className="block">
                <span className="mb-1 block text-sm font-medium text-niki-ink">{cat.label}</span>
                <select
                  name={`map:${cat.id}`}
                  defaultValue={categoryMap[cat.id] ?? ""}
                  className={inputClass}
                >
                  <option value="">{fallback ? `${fallback.name} (default)` : "Default"}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-5 w-48">
            <SubmitButton>Save mapping</SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
