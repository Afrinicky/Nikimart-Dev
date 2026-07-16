"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateSettings, {});
  const saved = state.ok === true;

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Delivery fees</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Door delivery is priced as base + per-kg of billable weight, then scaled by the destination zone. Pickup collection is a flat fee.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Base delivery fee (GH₵)" htmlFor="deliveryFee" hint={state.fieldErrors?.deliveryFee ?? "Flat base on every delivery"}>
            <input id="deliveryFee" name="deliveryFee" type="number" min="0" step="0.01" defaultValue={settings.deliveryFee} className={inputClass} />
          </Field>
          <Field label="Per-kg rate (GH₵)" htmlFor="deliveryPerKg" hint={state.fieldErrors?.deliveryPerKg ?? "Charged per billable kg"}>
            <input id="deliveryPerKg" name="deliveryPerKg" type="number" min="0" step="0.01" defaultValue={settings.deliveryPerKg} className={inputClass} />
          </Field>
          <Field label="Pickup fee (GH₵)" htmlFor="pickupFee" hint={state.fieldErrors?.pickupFee ?? "Flat fee for station pickup (0 = free)"}>
            <input id="pickupFee" name="pickupFee" type="number" min="0" step="0.01" defaultValue={settings.pickupFee} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Global shipping</h2>
        <p className="mt-1 text-sm text-niki-ink/60">Estimated days for imported items to arrive in Ghana.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="China (days)" htmlFor="leadDaysCN">
            <input id="leadDaysCN" name="leadDaysCN" type="number" min="0" defaultValue={settings.leadDaysCN} className={inputClass} />
          </Field>
          <Field label="Dubai (days)" htmlFor="leadDaysAE">
            <input id="leadDaysAE" name="leadDaysAE" type="number" min="0" defaultValue={settings.leadDaysAE} className={inputClass} />
          </Field>
          <Field label="USA (days)" htmlFor="leadDaysUS">
            <input id="leadDaysUS" name="leadDaysUS" type="number" min="0" defaultValue={settings.leadDaysUS} className={inputClass} />
          </Field>
          <Field label="Europe (days)" htmlFor="leadDaysEU">
            <input id="leadDaysEU" name="leadDaysEU" type="number" min="0" defaultValue={settings.leadDaysEU} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Contact & support</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Support email" htmlFor="supportEmail">
            <input id="supportEmail" name="supportEmail" type="email" defaultValue={settings.supportEmail} className={inputClass} />
          </Field>
          <Field label="Support phone" htmlFor="supportPhone">
            <input id="supportPhone" name="supportPhone" defaultValue={settings.supportPhone} className={inputClass} />
          </Field>
          <Field label="Business hours" htmlFor="businessHours">
            <input id="businessHours" name="businessHours" defaultValue={settings.businessHours} className={inputClass} />
          </Field>
          <Field label="Live chat status" htmlFor="liveChatStatus" hint="Shown under “Live chat” on the Help page">
            <input id="liveChatStatus" name="liveChatStatus" defaultValue={settings.liveChatStatus} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Footer & brand</h2>
        <div className="mt-4 space-y-4">
          <Field label="Footer tagline" htmlFor="footerTagline">
            <input id="footerTagline" name="footerTagline" defaultValue={settings.footerTagline} className={inputClass} />
          </Field>
          <Field label="Footer note" htmlFor="footerNote">
            <input id="footerNote" name="footerNote" defaultValue={settings.footerNote} className={inputClass} />
          </Field>
          <Field label="Copyright name" htmlFor="copyrightName">
            <input id="copyrightName" name="copyrightName" defaultValue={settings.copyrightName} className={inputClass} />
          </Field>
          <Field label="Restrictions notice" htmlFor="restrictionsText" hint="Shown at the bottom of the footer">
            <textarea id="restrictionsText" name="restrictionsText" rows={3} defaultValue={settings.restrictionsText} className={inputClass} />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>Save settings</SubmitButton>
        </div>
        {saved ? <span className="text-sm font-medium text-niki-success">Saved ✓</span> : null}
      </div>
    </form>
  );
}
