"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updateDataSettings, type DataSettingsState } from "@/lib/data-bundles/settings-actions";
import type { DataSettings } from "@/lib/data-bundles/settings";
import { FormFeedback } from "@/components/ui/FormFeedback";

/**
 * Storefront settings for /data-bundles. It posts to `updateDataSettings`,
 * which writes to the bundle database and only touches the keys a form actually
 * submits — so saving here never disturbs the referral rates on the next tab,
 * and never reaches the retail console's settings at all.
 *
 * The on/off switches are selects rather than checkboxes on purpose: an
 * unchecked checkbox isn't submitted at all, which would make "off" invisible
 * to an action that keys off what was sent.
 */
export function DataStoreSettingsForm({ settings }: { settings: DataSettings }) {
  const [state, formAction] = useActionState<DataSettingsState, FormData>(updateDataSettings, {});

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
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

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
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

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
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
            label="Low wallet alert (GH₵)"
            htmlFor="dataLowBalanceThreshold"
            hint="Text admins when the agent wallet drops below this. An empty wallet fails orders after the customer has paid."
          >
            <input id="dataLowBalanceThreshold" name="dataLowBalanceThreshold" type="number" min="0" step="1" defaultValue={settings.dataLowBalanceThreshold} className={inputClass} />
          </Field>
          {/*
            The "Buy Data Bundles" shortcut is retail chrome — it decides where
            the mall's sidebar and footer send customers — so it is a retail
            setting and is edited in Retail Services → Settings. It was here
            too, which meant two fields writing what is now two databases.
          */}
        </div>
      </section>

      <FormFeedback error={state.error} success={state.ok ? "Saved." : undefined} />
      <SubmitButton>Save store settings</SubmitButton>
    </form>
  );
}

/**
 * The agent programme's own settings: what it costs to open a storefront,
 * how that is collected, what agents pay for bundles, and where they go for
 * help.
 *
 * A second form over the same settings table rather than a second section of
 * the first one, because it belongs to a different module now — Agent
 * management, beside the agents it governs. `updateDataSettings` writes only
 * the keys a form actually submits, so saving one never disturbs the other.
 */
export function AgentProgrammeSettingsForm({ settings }: { settings: DataSettings }) {
  const [state, formAction] = useActionState<DataSettingsState, FormData>(updateDataSettings, {});

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Agent programme</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Recruiting resellers who run their own storefront at{" "}
          <code className="font-mono text-xs">/store/&lt;name&gt;</code>. Set an agent price on your
          bundles before you recruit, or there will be nothing for them to sell.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Signup"
            htmlFor="agentProgramEnabled"
            hint="Closing hides the pitch page. Existing agents keep trading."
          >
            <select
              id="agentProgramEnabled"
              name="agentProgramEnabled"
              defaultValue={settings.agentProgramEnabled === "0" ? "0" : "1"}
              className={inputClass}
            >
              <option value="1">Open — anyone can join</option>
              <option value="0">Closed — no new agents</option>
            </select>
          </Field>
          <Field
            label="Registration fee (GH₵)"
            htmlFor="agentSetupFee"
            hint="What it costs to open a storefront. A referral waiver can reduce it — see the Referrals tab."
          >
            <input
              id="agentSetupFee"
              name="agentSetupFee"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.agentSetupFee}
              className={inputClass}
            />
          </Field>
          <Field
            label="How the registration fee is collected"
            htmlFor="agentPaymentMode"
            hint="An up-front registration keeps the new agent's storefront closed until the payment clears."
          >
            <select
              id="agentPaymentMode"
              name="agentPaymentMode"
              defaultValue={settings.agentPaymentMode.trim().toUpperCase() || "BOTH"}
              className={inputClass}
            >
              <option value="BOTH">Either — the applicant chooses</option>
              <option value="UPFRONT">Up front only — paid before the store opens</option>
              <option value="COMMISSION">
                From commission only — nothing to pay before they start
              </option>
            </select>
          </Field>
          <Field
            label="Per-agent exceptions"
            htmlFor="agentPaymentModeOverrides"
            hint="Lets you give one agent's recruits a different arrangement, from that agent's own page. Off puts everyone back on the rule above without unpicking a single agent."
          >
            <select
              id="agentPaymentModeOverrides"
              name="agentPaymentModeOverrides"
              defaultValue={settings.agentPaymentModeOverrides === "0" ? "0" : "1"}
              className={inputClass}
            >
              <option value="1">Allowed — I can set it per agent</option>
              <option value="0">Not allowed — the rule above applies to everyone</option>
            </select>
          </Field>
          <Field
            label="Withdrawal fee (GH₵)"
            htmlFor="agentWithdrawalFee"
            hint="Flat fee deducted with each MoMo payout"
          >
            <input
              id="agentWithdrawalFee"
              name="agentWithdrawalFee"
              type="number"
              min="0"
              step="0.5"
              defaultValue={settings.agentWithdrawalFee}
              className={inputClass}
            />
          </Field>
          <Field
            label="Minimum withdrawal (GH₵)"
            htmlFor="agentMinWithdrawal"
            hint="The smallest payout an agent may request. Their Withdraw button stays closed until they have this much clear of the fee."
          >
            <input
              id="agentMinWithdrawal"
              name="agentMinWithdrawal"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.agentMinWithdrawal}
              className={inputClass}
            />
          </Field>
          <Field
            label="Default agent discount (%)"
            htmlFor="agentAgentMarkupPercent"
            hint="Pre-filled in “Price from cost”: how far under retail agents buy."
          >
            <input
              id="agentAgentMarkupPercent"
              name="agentAgentMarkupPercent"
              type="number"
              min="0"
              max="90"
              step="1"
              defaultValue={settings.agentAgentMarkupPercent}
              className={inputClass}
            />
          </Field>
          <Field label="Agent support phone" htmlFor="agentSupportPhone">
            <input
              id="agentSupportPhone"
              name="agentSupportPhone"
              defaultValue={settings.agentSupportPhone}
              placeholder="0241234567"
              className={inputClass}
            />
          </Field>
          <Field
            label="Agent support WhatsApp"
            htmlFor="agentSupportWhatsapp"
            hint="Number, not a link — e.g. 0241234567"
          >
            <input
              id="agentSupportWhatsapp"
              name="agentSupportWhatsapp"
              defaultValue={settings.agentSupportWhatsapp}
              className={inputClass}
            />
          </Field>
          <Field
            label="Agent WhatsApp group"
            htmlFor="agentWhatsappGroup"
            hint="Pre-filled on every new agent's store"
          >
            <input
              id="agentWhatsappGroup"
              name="agentWhatsappGroup"
              type="url"
              defaultValue={settings.agentWhatsappGroup}
              placeholder="https://chat.whatsapp.com/…"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Recruitment pitch"
            htmlFor="agentPitch"
            hint="The line under the headline on /become-an-agent"
          >
            <input
              id="agentPitch"
              name="agentPitch"
              defaultValue={settings.agentPitch}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <FormFeedback error={state.error} success={state.ok ? "Saved." : undefined} />
      <SubmitButton>Save programme settings</SubmitButton>
    </form>
  );
}
