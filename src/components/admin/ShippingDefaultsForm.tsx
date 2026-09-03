"use client";

import { useActionState, useState } from "react";
import { Calculator } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { saveShippingDefaults, type ShippingState } from "@/lib/shipping-admin-actions";

interface PointOption {
  id: string;
  label: string;
}

/**
 * The numbers behind everything, and a calculator that shows what they do.
 *
 * The calculator is not decoration. "Base 10, extra 1.50" is an abstraction
 * until somebody types in ten bottles of spray and reads GH₵23.50 back — and
 * the old model's answer to that same question was GH₵100, for one parcel on
 * one van, which is the whole reason this shape exists. An admin who cannot
 * picture the fee they are setting sets it by guesswork and finds out from a
 * complaint.
 */
export function ShippingDefaultsForm({
  settings,
  points,
}: {
  settings: Record<string, string>;
  points: PointOption[];
}) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingDefaults, {});

  const [baseFee, setBaseFee] = useState(Number(settings.shipBaseFee) || 0);
  const [perUnitFee, setPerUnitFee] = useState(Number(settings.shipPerUnitFee) || 0);
  const [minFee, setMinFee] = useState(Number(settings.shipMinFee) || 0);
  const [units, setUnits] = useState(10);
  const [sellers, setSellers] = useState(1);

  const perSeller = Math.max(baseFee + perUnitFee * Math.max(0, units - 1), minFee);
  const sampleFee = perSeller * Math.max(1, sellers);
  // What the same basket cost before the base fee stopped multiplying. Shown
  // beside the new figure because it is the clearest possible statement of what
  // changed, and the number people remember complaining about.
  const oldModelFee = baseFee * Math.max(1, units) * Math.max(1, sellers);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          Saved ✓
        </p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Inside Ghana</h2>
        <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
          One seller&apos;s goods are one consignment — one pickup, one van, one handover — so the
          base fee is charged once per seller and every item after the first adds only the
          increment. These apply when no rule on the Inside Ghana screen says otherwise.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Base fee (GH₵)"
            htmlFor="shipBaseFee"
            hint="The first item from a seller. Charged once, however many they order."
          >
            <input
              id="shipBaseFee"
              name="shipBaseFee"
              type="number"
              min="0"
              step="0.01"
              value={baseFee || ""}
              onChange={(e) => setBaseFee(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Each additional item (GH₵)"
            htmlFor="shipPerUnitFee"
            hint="The weight-and-volume increment for every unit after the first."
          >
            <input
              id="shipPerUnitFee"
              name="shipPerUnitFee"
              type="number"
              min="0"
              step="0.01"
              value={perUnitFee || ""}
              onChange={(e) => setPerUnitFee(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Minimum fee (GH₵)"
            htmlFor="shipMinFee"
            hint="A charged run is never billed under this. Collection where the goods already sit stays free."
          >
            <input
              id="shipMinFee"
              name="shipMinFee"
              type="number"
              min="0"
              step="0.01"
              value={minFee || ""}
              onChange={(e) => setMinFee(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Volumetric divisor"
            htmlFor="shipVolumetricDivisor"
            hint="cm³ per volumetric kg. Used for the billable weight shown to sellers and for air freight."
          >
            <input
              id="shipVolumetricDivisor"
              name="shipVolumetricDivisor"
              type="number"
              min="1"
              step="1"
              defaultValue={settings.shipVolumetricDivisor ?? "5000"}
              className={inputClass}
            />
          </Field>
        </div>

        {/* The calculator. Not submitted — it only shows what the numbers do. */}
        <div className="mt-5 rounded-2xl bg-niki-black p-5 text-white">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-niki-orange" />
            <h3 className="font-display text-base font-bold">Try it on a basket</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-white/70">Items ordered</span>
              <input
                type="number"
                min="1"
                step="1"
                value={units || ""}
                onChange={(e) => setUnits(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-niki-orange"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-white/70">From how many sellers</span>
              <input
                type="number"
                min="1"
                step="1"
                value={sellers || ""}
                onChange={(e) => setSellers(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-niki-orange"
              />
            </label>
          </div>
          <p className="mt-4 text-sm text-white/75">
            Shipping to a station the goods are not already at:{" "}
            <span className="font-figures text-lg font-bold text-niki-orange">
              {formatPrice(sampleFee)}
            </span>
            {sellers > 1 ? (
              <span className="text-white/60"> — {formatPrice(perSeller)} per seller</span>
            ) : null}
            .
          </p>
          {oldModelFee > sampleFee ? (
            <p className="mt-1 text-xs text-white/50">
              The old per-item model charged {formatPrice(oldModelFee)} for the same basket.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Defaults for listings</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          What a listing falls back to when its seller has not said otherwise.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Default consolidation point"
            htmlFor="shipDefaultPointId"
            hint="Used by a listing whose seller picked none, and whose shop has no default either."
          >
            <select
              id="shipDefaultPointId"
              name="shipDefaultPointId"
              defaultValue={settings.shipDefaultPointId ?? ""}
              className={inputClass}
            >
              <option value="">None — price from the platform defaults</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>Save</SubmitButton>
        </div>
      </div>
    </form>
  );
}
