"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import { inputClass } from "@/components/ui/Field";

/**
 * The three prices the Start Selling page charges.
 *
 * Each field is worded as what the applicant pays, not as an override of
 * something: blank is "the same as usual", and a number is a price. The
 * programme's own figure is the placeholder, so an admin can see what they are
 * changing it from without leaving the screen.
 */
export function StartSellingForm({
  settings,
  normal,
}: {
  settings: Record<string, string>;
  /** What each programme charges anybody who does not come through the page. */
  normal: { shop: number; agent: number; affiliate: number };
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});

  const field = "block text-sm font-medium text-niki-ink/80";
  const hint = "mt-1.5 block text-xs leading-relaxed text-niki-ink/50";
  const money = (n: number) =>
    n > 0 ? `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "Free";

  return (
    <form action={action} className="space-y-6">
      <Toggle
        name="startSellingFeesEnabled"
        value={settings.startSellingFeesEnabled}
        label="Charge Start Selling prices"
        hint="Off leaves every programme charging its own price, wherever somebody signs up. On applies the three prices below — but only to people who arrive through the Start Selling page."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={field}>Open a shop (GH₵)</span>
          <input
            name="startSellingShopFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={settings.startSellingShopFee}
            placeholder={String(normal.shop)}
            className={inputClass}
          />
          <span className={hint}>Usually {money(normal.shop)}.</span>
        </label>

        <label className="block">
          <span className={field}>Resell data bundles (GH₵)</span>
          <input
            name="startSellingAgentFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={settings.startSellingAgentFee}
            placeholder={String(normal.agent)}
            className={inputClass}
          />
          <span className={hint}>Usually {money(normal.agent)}.</span>
        </label>

        <label className="block">
          <span className={field}>Refer and earn (GH₵)</span>
          <input
            name="startSellingAffiliateFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={settings.startSellingAffiliateFee}
            placeholder={String(normal.affiliate)}
            className={inputClass}
          />
          <span className={hint}>Usually {money(normal.affiliate)}.</span>
        </label>
      </div>

      <p className="rounded-xl bg-niki-surface px-4 py-3 text-xs leading-relaxed text-niki-ink/55">
        Leave a box empty and that programme charges what it always charges. A zero is a price in
        its own right — free, through this page only. What somebody is quoted is recorded on their
        registration, so changing a price here never rewrites one that already happened.
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
        Save prices
      </button>
    </form>
  );
}

/**
 * A switch that submits "1" or "0".
 *
 * A bare checkbox submits nothing at all when it is off, and the settings
 * writer only touches keys the form actually sends — so an unchecked box would
 * leave the old value in place, which here is the difference between charging
 * a campaign price and not.
 *
 * The trailing hidden input is what makes "off" a value, and the order is not
 * decoration: the writer reads the first entry under the name, so the checkbox
 * has to come first or "on" would never be heard.
 */
function Toggle({
  name,
  value,
  label,
  hint,
}: {
  name: string;
  value: string | undefined;
  label: string;
  hint?: string;
}) {
  const on = (value ?? "").trim() === "1";
  return (
    <div className="rounded-xl bg-niki-surface px-4 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={on}
          className="mt-0.5 h-4 w-4 shrink-0 accent-niki-orange"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-niki-ink">{label}</span>
          {hint ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-niki-ink/55">{hint}</span>
          ) : null}
        </span>
      </label>
      <input type="hidden" name={name} value="0" />
    </div>
  );
}
