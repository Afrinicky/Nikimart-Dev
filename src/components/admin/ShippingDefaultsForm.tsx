"use client";

import { useActionState, useState } from "react";
import { Calculator } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPrice } from "@/lib/format";
import { billableWeightKg } from "@/lib/shipping";
import { saveShippingDefaults, type ShippingState } from "@/lib/shipping-admin-actions";

interface PointOption {
  id: string;
  label: string;
}

/**
 * The numbers behind everything, and a calculator that shows what they do.
 *
 * The calculator is not decoration. "Base 15, per kg 4" is an abstraction until
 * somebody types in a blender and reads GH₵35 back, and an admin who cannot
 * picture the fee they are setting sets it by guesswork and finds out from a
 * complaint. It runs the same `billableWeightKg` the checkout runs, so the
 * number here is the number charged.
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
  const [perKgRate, setPerKgRate] = useState(Number(settings.shipPerKgRate) || 0);
  const [divisor, setDivisor] = useState(Number(settings.shipVolumetricDivisor) || 5000);
  const [minFee, setMinFee] = useState(Number(settings.shipMinFee) || 0);
  const [sample, setSample] = useState({ weightKg: 3, lengthCm: 40, widthCm: 30, heightCm: 20 });

  const sampleWeight = billableWeightKg(
    {
      shippingWeightKg: sample.weightKg,
      lengthCm: sample.lengthCm,
      widthCm: sample.widthCm,
      heightCm: sample.heightCm,
    },
    divisor,
  );
  const sampleFee = Math.max(baseFee + perKgRate * sampleWeight, minFee);

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
        <p className="mt-1 text-sm text-niki-ink/60">
          What the courier run from a consolidation point to a pickup station costs when no rule on
          the Rates screen says otherwise. Priced on billable weight — the greater of what a parcel
          weighs and what its size says it weighs.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Base fee (GH₵)" htmlFor="shipBaseFee" hint="Charged once per consignment.">
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
          <Field label="Per kilogram (GH₵)" htmlFor="shipPerKgRate" hint="On the billable weight.">
            <input
              id="shipPerKgRate"
              name="shipPerKgRate"
              type="number"
              min="0"
              step="0.01"
              value={perKgRate || ""}
              onChange={(e) => setPerKgRate(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Volumetric divisor"
            htmlFor="shipVolumetricDivisor"
            hint="cm³ per volumetric kg. Couriers use 5000; 6000 is gentler on bulky goods."
          >
            <input
              id="shipVolumetricDivisor"
              name="shipVolumetricDivisor"
              type="number"
              min="1"
              step="1"
              value={divisor || ""}
              onChange={(e) => setDivisor(Number(e.target.value) || 0)}
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
        </div>

        {/* The calculator. Not submitted — it only shows what the numbers do. */}
        <div className="mt-5 rounded-2xl bg-niki-black p-5 text-white">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-niki-orange" />
            <h3 className="font-display text-base font-bold">Try it on a parcel</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {(
              [
                ["weightKg", "Weight (kg)"],
                ["lengthCm", "Length (cm)"],
                ["widthCm", "Width (cm)"],
                ["heightCm", "Height (cm)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-medium text-white/70">{label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={sample[key] || ""}
                  onChange={(e) => setSample((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-niki-orange"
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm text-white/75">
            Billed at{" "}
            <span className="font-figures font-bold text-white">{sampleWeight} kg</span> — so a run
            to a station this parcel is not already at costs{" "}
            <span className="font-figures font-bold text-niki-orange">{formatPrice(sampleFee)}</span>
            , and collecting it where it already sits is free.
          </p>
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
