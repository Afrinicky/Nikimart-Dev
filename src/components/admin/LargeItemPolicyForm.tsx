"use client";

import { useActionState, useState } from "react";
import { Ruler } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatPrice } from "@/lib/format";
import { saveShippingDefaults, type ShippingState } from "@/lib/shipping-admin-actions";

/**
 * What counts as a large item, and what a cubic metre of one costs.
 *
 * A fridge and a phone case do not cost the same to move and no flat base fee
 * can be right for both. So an admin draws the line: a longest side, a volume,
 * a weight — any of them, and an item that trips one is priced by its size on
 * the grid above instead of at that lane's flat base.
 *
 * The calculator is the point of the screen. "0.6 m³ at GH₵120" is an
 * abstraction until you type a fridge's actual measurements into it and read
 * back what a buyer will be charged for two of them.
 */
export function LargeItemPolicyForm({ settings }: { settings: Record<string, string> }) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingDefaults, {});

  const [enabled, setEnabled] = useState(settings.shipLargeEnabled !== "0");
  const [longest, setLongest] = useState(Number(settings.shipLargeMinLongestCm) || 0);
  const [minCbm, setMinCbm] = useState(Number(settings.shipLargeMinCbm) || 0);
  const [minWeight, setMinWeight] = useState(Number(settings.shipLargeMinWeightKg) || 0);
  const [rate, setRate] = useState(Number(settings.shipLargeRatePerCbm) || 0);
  const [floor, setFloor] = useState(Number(settings.shipLargeMinFee) || 0);
  const [share, setShare] = useState(Number(settings.shipLargeExtraPercent) || 0);

  // A chest freezer, roughly. The numbers are only a sample — nothing here is
  // submitted, and the lane's own rate overrides the platform one when set.
  const [length, setLength] = useState(180);
  const [width, setWidth] = useState(70);
  const [height, setHeight] = useState(85);
  const [count, setCount] = useState(2);

  const cbm = Math.round(((length * width * height) / 1_000_000) * 1000) / 1000;
  const isLarge =
    enabled &&
    ((longest > 0 && Math.max(length, width, height) >= longest) || (minCbm > 0 && cbm >= minCbm));
  const unit = Math.max(cbm * rate, floor);
  const total = unit + unit * (share / 100) * Math.max(0, count - 1);

  return (
    <form action={formAction} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
        <Ruler className="h-5 w-5 text-niki-orange" />
        What counts as a large item
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
        Fridges, chest freezers, the bigger ovens. An item that trips any one of these is priced by
        the space it takes on the grid above, not by that lane&apos;s flat base fee. A threshold of{" "}
        <span className="font-figures">0</span> is not a test at all, so you can flag by size alone,
        by weight alone, or by both.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Large-item pricing" htmlFor="shipLargeEnabled">
          <select
            id="shipLargeEnabled"
            name="shipLargeEnabled"
            value={enabled ? "1" : "0"}
            onChange={(e) => setEnabled(e.target.value === "1")}
            className={inputClass}
          >
            <option value="1">On — price big goods by their size</option>
            <option value="0">Off — everything pays the flat base fee</option>
          </select>
        </Field>
        <Field
          label="Longest side (cm)"
          htmlFor="shipLargeMinLongestCm"
          hint="Any side this long or longer makes it large."
        >
          <input
            id="shipLargeMinLongestCm"
            name="shipLargeMinLongestCm"
            type="number"
            min="0"
            step="1"
            value={longest || ""}
            onChange={(e) => setLongest(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Volume (m³)" htmlFor="shipLargeMinCbm" hint="Length × width × height, in cubic metres.">
          <input
            id="shipLargeMinCbm"
            name="shipLargeMinCbm"
            type="number"
            min="0"
            step="0.001"
            value={minCbm || ""}
            onChange={(e) => setMinCbm(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Weight (kg)"
          htmlFor="shipLargeMinWeightKg"
          hint="What it actually weighs on the scales, not its volumetric weight."
        >
          <input
            id="shipLargeMinWeightKg"
            name="shipLargeMinWeightKg"
            type="number"
            min="0"
            step="0.5"
            value={minWeight || ""}
            onChange={(e) => setMinWeight(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
      </div>

      <h3 className="mt-7 font-display text-base font-bold text-niki-ink">
        What a cubic metre costs, when the lane has not said
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
        The grid above prices large goods per run. These are the fallbacks for a cell nobody has
        filled in. Leave the rate at <span className="font-figures">0</span> and large items simply
        pay the ordinary base fee — they are never quoted free because a box was left empty.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Rate per m³ (GH₵)" htmlFor="shipLargeRatePerCbm">
          <input
            id="shipLargeRatePerCbm"
            name="shipLargeRatePerCbm"
            type="number"
            min="0"
            step="0.01"
            value={rate || ""}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Minimum per large item (GH₵)"
          htmlFor="shipLargeMinFee"
          hint="A floor under the size-based price."
        >
          <input
            id="shipLargeMinFee"
            name="shipLargeMinFee"
            type="number"
            min="0"
            step="0.01"
            value={floor || ""}
            onChange={(e) => setFloor(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Each additional large item (%)"
          htmlFor="shipLargeExtraPercent"
          hint="Of its own size-based price. The biggest one in the consignment pays in full."
        >
          <input
            id="shipLargeExtraPercent"
            name="shipLargeExtraPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={share || ""}
            onChange={(e) => setShare(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
      </div>

      {/* The calculator. Not submitted — it only shows what the numbers do. */}
      <div className="mt-6 rounded-2xl bg-niki-black p-5 text-white">
        <h3 className="font-display text-base font-bold">Try it on an actual appliance</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Length (cm)", value: length, set: setLength },
            { label: "Width (cm)", value: width, set: setWidth },
            { label: "Height (cm)", value: height, set: setHeight },
            { label: "How many", value: count, set: setCount },
          ].map(({ label, value, set }) => (
            <label key={label} className="block">
              <span className="mb-1 block text-xs font-medium text-white/70">{label}</span>
              <input
                type="number"
                min="1"
                value={value || ""}
                onChange={(e) => set(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-figures text-sm text-white outline-none focus:border-niki-orange"
              />
            </label>
          ))}
        </div>
        <p className="mt-4 text-sm text-white/75">
          {cbm} m³ each —{" "}
          {isLarge ? (
            <span className="font-semibold text-niki-orange">flagged as a large item</span>
          ) : (
            <span className="text-white/60">
              not large by these thresholds, so it pays the ordinary base fee
            </span>
          )}
          .
        </p>
        {isLarge ? (
          <p className="mt-1 text-sm text-white/75">
            {rate > 0 ? (
              <>
                {count} of them from one seller:{" "}
                <span className="font-figures text-lg font-bold text-niki-orange">
                  {formatPrice(total)}
                </span>{" "}
                <span className="text-white/50">
                  — {formatPrice(unit)} for the biggest, then {Math.max(0, count - 1)} ×{" "}
                  {formatPrice(unit * (share / 100))}
                </span>
              </>
            ) : (
              <span className="text-white/60">
                No platform rate per m³ is set, so this falls to the lane&apos;s own rate on the
                grid above, and to the flat base fee where that is empty too.
              </span>
            )}
          </p>
        ) : null}
      </div>

      <FormFeedback error={state.error} success={state.ok ? "Saved ✓" : undefined} className="mt-5" />
      <div className="mt-5 w-48">
        <SubmitButton>Save large items</SubmitButton>
      </div>
    </form>
  );
}
