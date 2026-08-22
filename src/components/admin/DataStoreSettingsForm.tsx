"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import type { Settings } from "@/lib/settings";

/**
 * Storefront settings for /data-bundles. It posts to the shared `updateSettings`
 * action, which only writes the keys a form actually submits — so saving here
 * never disturbs shipping, commission, or the rest of Admin → Settings.
 *
 * The on/off switches are selects rather than checkboxes on purpose: an
 * unchecked checkbox isn't submitted at all, which would make "off" invisible
 * to an action that keys off what was sent.
 */
export function DataStoreSettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateSettings, {});

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          Saved.
        </p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Storefront</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Branding and availability of the bundle store at <code className="font-mono text-xs">/data-bundles</code>.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Store status" htmlFor="dataBundlesEnabled" hint="Closing hides the storefront; the admin console stays open">
            <select
              id="dataBundlesEnabled"
              name="dataBundlesEnabled"
              defaultValue={settings.dataBundlesEnabled === "0" ? "0" : "1"}
              className={inputClass}
            >
              <option value="1">Open — buyers can order</option>
              <option value="0">Closed — storefront hidden</option>
            </select>
          </Field>
          <Field label="Store name" htmlFor="dataStoreName">
            <input id="dataStoreName" name="dataStoreName" defaultValue={settings.dataStoreName} className={inputClass} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Tagline" htmlFor="dataStoreTagline" hint="The line under the store name">
            <input id="dataStoreTagline" name="dataStoreTagline" defaultValue={settings.dataStoreTagline} className={inputClass} />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Support WhatsApp link"
            htmlFor="dataSupportWhatsapp"
            hint="e.g. https://wa.me/233241234567 — leave empty to hide the button"
          >
            <input
              id="dataSupportWhatsapp"
              name="dataSupportWhatsapp"
              type="url"
              defaultValue={settings.dataSupportWhatsapp}
              placeholder="https://wa.me/233…"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">AFA registration</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Sold alongside bundles and submitted to the provider once paid.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Availability" htmlFor="dataAfaEnabled">
            <select
              id="dataAfaEnabled"
              name="dataAfaEnabled"
              defaultValue={settings.dataAfaEnabled === "0" ? "0" : "1"}
              className={inputClass}
            >
              <option value="1">On sale</option>
              <option value="0">Not offered</option>
            </select>
          </Field>
          <Field label="Registration fee (GH₵)" htmlFor="dataAfaPrice">
            <input id="dataAfaPrice" name="dataAfaPrice" type="number" min="0" step="0.5" defaultValue={settings.dataAfaPrice} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Pricing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Default markup (%)"
            htmlFor="dataMarkupPercent"
            hint="Pre-filled in the “Price from cost” tool on the Bundle prices tab"
          >
            <input id="dataMarkupPercent" name="dataMarkupPercent" type="number" min="0" max="500" step="1" defaultValue={settings.dataMarkupPercent} className={inputClass} />
          </Field>
          <Field
            label="“Buy Data Bundles” link"
            htmlFor="dataBundlesUrl"
            hint="Where the sidebar, footer and carousel shortcuts point. Keep /data-bundles for this store."
          >
            <input id="dataBundlesUrl" name="dataBundlesUrl" defaultValue={settings.dataBundlesUrl} className={inputClass} />
          </Field>
        </div>
      </section>

      <SubmitButton>Save data store settings</SubmitButton>
    </form>
  );
}
