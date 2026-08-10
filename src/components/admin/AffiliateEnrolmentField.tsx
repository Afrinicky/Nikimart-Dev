"use client";

import { useState } from "react";
import { Gift, Info } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import {
  maxPlatformFundedRate,
  maxSellerFundedRate,
  resolveAffiliateRate,
} from "@/lib/affiliate-commission";

/**
 * Affiliate enrolment for a product, asked at listing time and editable later.
 *
 * Sellers choose whether to offer their product to affiliates and at what rate
 * — that commission comes out of their own earnings, so the choice is theirs.
 * Admins get one extra option: enrolling the product at NikiMart's expense,
 * which is capped at half the platform commission on the item.
 *
 * Turning enrolment off immediately removes the product from every affiliate's
 * shareable catalogue; commission already earned on past orders is untouched.
 */
export function AffiliateEnrolmentField({
  actor,
  enabled,
  enrolledBy,
  rate,
  categoryAffiliateRate,
  platformCommissionRate,
  defaultAffiliateRate,
}: {
  actor: "admin" | "seller";
  enabled: boolean;
  enrolledBy: string;
  rate: number | null;
  categoryAffiliateRate: number | null;
  platformCommissionRate: number;
  defaultAffiliateRate: number;
}) {
  const [on, setOn] = useState(enabled);
  const [funder, setFunder] = useState(enrolledBy === "admin" ? "admin" : "seller");
  const [rateInput, setRateInput] = useState(rate === null || rate === undefined ? "" : String(rate));

  const inheritedRate = categoryAffiliateRate ?? defaultAffiliateRate;
  const effectiveFunder = actor === "admin" ? funder : "seller";
  const ceiling =
    effectiveFunder === "admin"
      ? maxPlatformFundedRate(platformCommissionRate)
      : maxSellerFundedRate(platformCommissionRate);

  const resolved = resolveAffiliateRate({
    affiliateEnabled: true,
    affiliateEnrolledBy: effectiveFunder,
    affiliateCommissionRate: rateInput.trim() === "" ? null : Number(rateInput),
    categoryAffiliateRate,
    defaultAffiliateRate,
    platformCommissionRate,
  });

  return (
    <fieldset className="rounded-xl bg-niki-surface p-4 ring-1 ring-black/5">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
        Affiliate programme
      </legend>

      <label className="mt-1 flex items-start gap-2.5 text-sm text-niki-ink/80">
        <input
          type="checkbox"
          name="affiliateEnabled"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded"
        />
        <span>
          <span className="font-semibold text-niki-ink">Offer this product to affiliate marketers</span>
          <span className="mt-0.5 block text-niki-ink/60">
            Affiliates can share a link to it and earn commission on every sale they refer. Untick it
            any time and the product disappears from their catalogue.
          </span>
        </span>
      </label>

      {on ? (
        <div className="mt-4 space-y-4 border-t border-black/5 pt-4">
          {actor === "admin" ? (
            <div>
              <label htmlFor="affiliateFundedBy" className="mb-1.5 block text-sm font-medium text-niki-ink/80">
                Who pays the commission?
              </label>
              <select
                id="affiliateFundedBy"
                name="affiliateFundedBy"
                value={funder}
                onChange={(e) => setFunder(e.target.value)}
                className={inputClass}
              >
                <option value="seller">The seller — deducted from their earnings</option>
                <option value="admin">NikiMart — paid out of the platform commission</option>
              </select>
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-niki-ink/60">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {funder === "admin" ? (
                  <span>
                    NikiMart funds this one. Platform commission on this item is{" "}
                    <strong>{platformCommissionRate}%</strong>, so the affiliate rate is capped at half
                    of it — <strong>{ceiling}%</strong>.
                  </span>
                ) : (
                  <span>
                    Only enrol at the seller&apos;s expense when they&apos;ve agreed to it. Otherwise
                    put it on NikiMart&apos;s tab.
                  </span>
                )}
              </p>
            </div>
          ) : (
            <input type="hidden" name="affiliateFundedBy" value="seller" />
          )}

          <div>
            <label htmlFor="affiliateCommissionRate" className="mb-1.5 block text-sm font-medium text-niki-ink/80">
              Affiliate commission (%)
            </label>
            <input
              id="affiliateCommissionRate"
              name="affiliateCommissionRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder={String(inheritedRate)}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-niki-ink/60">
              Leave blank to use the{" "}
              {categoryAffiliateRate !== null && categoryAffiliateRate !== undefined
                ? "category rate"
                : "programme default"}{" "}
              of <strong>{inheritedRate}%</strong>. Maximum here: <strong>{ceiling}%</strong>.
            </p>
          </div>

          <p className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-niki-ink/70 ring-1 ring-black/5">
            <Gift className="h-4 w-4 shrink-0 text-niki-orange" />
            <span>
              Affiliates earn <strong className="text-niki-ink">{resolved.rate}%</strong> of the item
              price
              {effectiveFunder === "admin" ? ", funded by NikiMart" : ", deducted from the seller's earnings"}.
              {resolved.capped ? (
                <span className="text-niki-ink/60"> Reduced from {resolved.requestedRate}% by the cap.</span>
              ) : null}
            </span>
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
