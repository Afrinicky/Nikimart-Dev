"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import { inputClass } from "@/components/ui/Field";

/**
 * What a shop pays to open through the Start Selling page.
 *
 * Only the shop's price is here. The bundle storefront's and the affiliate's
 * are set in their own consoles, beside the registration fee each of them
 * overrides — an admin changing what joining a programme costs should find
 * both of its prices in one place rather than half of it here.
 *
 * The field is worded as what the applicant pays, not as an override of
 * something: blank is "the same as usual", and a number is a price. The
 * ordinary fee is the placeholder, so it is visible without leaving.
 */
export function StartSellingForm({
  settings,
  /** What a shop costs anybody who does not come through the page. */
  normal,
}: {
  settings: Record<string, string>;
  normal: number;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});

  return (
    <form action={action} className="space-y-5">
      <label className="block max-w-xs">
        <span className="block text-sm font-medium text-niki-ink/80">Open a shop (GH₵)</span>
        <input
          name="startSellingShopFee"
          type="number"
          min="0"
          step="0.01"
          defaultValue={settings.startSellingShopFee}
          placeholder={String(normal)}
          className={inputClass}
        />
        <span className="mt-1.5 block text-xs leading-relaxed text-niki-ink/50">
          Usually {normal > 0 ? `GH₵${normal.toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "free"}.
          Leave it empty and that is what this page charges too.
        </span>
      </label>

      <p className="rounded-xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/55">
        A zero is a price in its own right — free, through this page only. What somebody is quoted
        is recorded on their registration, so changing a price here never rewrites one that
        already happened.
      </p>

      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/20">
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save price
      </button>
    </form>
  );
}
