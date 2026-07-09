"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { computeLandedCost, LANDED_COST_LABELS } from "@/lib/global-data";
import { formatPrice } from "@/lib/format";
import { Field, inputClass } from "@/components/ui/Field";

export function LandedCostEstimator({ defaultPrice = 1000 }: { defaultPrice?: number }) {
  const [price, setPrice] = useState<number>(defaultPrice);
  const cost = computeLandedCost(price);

  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-7">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-navy text-niki-orange">
          <Calculator className="h-5 w-5" />
        </span>
        <h3 className="font-display text-lg font-bold text-niki-ink">Landed-cost estimator</h3>
      </div>
      <p className="mt-2 text-sm text-niki-ink/60">
        Enter the product price abroad and see the estimated total to your door or pickup point.
      </p>

      <div className="mt-5">
        <Field label="Product price (GH₵)" htmlFor="price">
          <input
            id="price"
            type="number"
            min={0}
            value={Number.isFinite(price) ? price : ""}
            onChange={(e) => setPrice(Number(e.target.value))}
            className={inputClass}
            placeholder="1000"
          />
        </Field>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        {LANDED_COST_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between border-b border-black/5 pb-2">
            <dt className="text-niki-ink/60">{label}</dt>
            <dd className="font-medium text-niki-ink">{formatPrice(cost[key])}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <dt className="font-display text-base font-bold text-niki-ink">Estimated total</dt>
          <dd className="font-display text-lg font-bold text-niki-orange">{formatPrice(cost.total)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-niki-ink/45">
        Estimate only. Your final quote is confirmed after we review the item and destination.
      </p>
    </div>
  );
}
