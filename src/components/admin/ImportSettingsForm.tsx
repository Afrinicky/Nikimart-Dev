"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { saveShippingDefaults, type ShippingState } from "@/lib/shipping-admin-actions";

/**
 * The numbers behind an imported order, and the copy on the public page.
 *
 * These used to live in Settings, three tabs away from the rates they modify —
 * so an admin correcting a duty rate had no way to see what it did to a bill.
 * They belong beside the forwarders whose quotes they sit on top of.
 *
 * None of it is ever itemised to a buyer. Duty and VAT are charged, and they
 * are inside the single shipping figure on the checkout screen.
 */
export function ImportSettingsForm({ settings }: { settings: Record<string, string> }) {
  const [state, formAction] = useActionState<ShippingState, FormData>(saveShippingDefaults, {});

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">Saved ✓</p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Duty &amp; tax</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Charged on the landed value of an imported line, and folded into its shipping figure.
          Skipped entirely when the forwarder&apos;s rate already covers them, which is the usual
          case — so for most orders these never apply at all.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Ghana VAT & levies (%)"
            htmlFor="ghanaImportTaxRate"
            hint="On the landed value plus duty. 15% VAT plus NHIL/GETFund is the usual standing figure."
          >
            <input
              id="ghanaImportTaxRate"
              name="ghanaImportTaxRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={settings.ghanaImportTaxRate}
              className={inputClass}
            />
          </Field>
          <Field
            label="Fallback import duty (%)"
            htmlFor="defaultImportDutyPercent"
            hint="Used for a consolidation point whose own duty hasn't been set."
          >
            <input
              id="defaultImportDutyPercent"
              name="defaultImportDutyPercent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={settings.defaultImportDutyPercent}
              className={inputClass}
            />
          </Field>
          <Field
            label="Fallback rate per CBM (GH₵)"
            htmlFor="shipFallbackRatePerCbm"
            hint="Used when a listing's route matches no forwarder price. Leave at 0 to refuse the sale instead — safer than guessing at a container."
          >
            <input
              id="shipFallbackRatePerCbm"
              name="shipFallbackRatePerCbm"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.shipFallbackRatePerCbm}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Paying for shipping</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Buyers always pay the full item price at checkout — that is money the seller spends as
          soon as they fulfil the order. The shipping is the part that can wait, and each seller
          decides per listing whether it does. This is the platform-wide switch.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Settle shipping at collection" htmlFor="shipPayOnPickupEnabled">
            <select
              id="shipPayOnPickupEnabled"
              name="shipPayOnPickupEnabled"
              defaultValue={settings.shipPayOnPickupEnabled}
              className={inputClass}
            >
              <option value="1">Allowed — sellers choose per listing</option>
              <option value="0">Off — everyone pays shipping at checkout</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Lead times</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Estimated days for imported goods to reach Ghana, per origin. Used where a listing and its
          forwarder say nothing more specific.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ["leadDaysCN", "China"],
              ["leadDaysAE", "Dubai"],
              ["leadDaysUS", "USA"],
              ["leadDaysEU", "Europe"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={`${label} (days)`} htmlFor={key}>
              <input id={key} name={key} type="number" min="0" defaultValue={settings[key]} className={inputClass} />
            </Field>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">The public page</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The heading and blurb on <span className="font-medium">/shipped-from-abroad</span>.
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="Page heading" htmlFor="abroadPageTitle">
            <input id="abroadPageTitle" name="abroadPageTitle" defaultValue={settings.abroadPageTitle} className={inputClass} />
          </Field>
          <Field label="Page intro" htmlFor="abroadPageIntro">
            <textarea id="abroadPageIntro" name="abroadPageIntro" rows={2} defaultValue={settings.abroadPageIntro} className={inputClass} />
          </Field>
        </div>
      </section>

      <div className="w-44">
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
