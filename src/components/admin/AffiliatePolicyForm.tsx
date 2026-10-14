"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import { inputClass } from "@/components/ui/Field";

/**
 * The programme's rules, in one form.
 *
 * It writes through the ordinary settings action, which only touches the keys
 * a form actually submits — so saving here cannot blank the shipping console's
 * settings, and this screen does not need a writer of its own.
 *
 * Everything on it is worded as the consequence rather than the field name. An
 * admin changing the return window is deciding how long an affiliate waits for
 * their money, and the form should say so.
 */
export function AffiliatePolicyForm({
  settings,
}: {
  settings: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});

  const field = "block text-sm font-medium text-niki-ink/80";
  const hint = "mt-1.5 block text-xs leading-relaxed text-niki-ink/50";

  return (
    <form action={action} className="space-y-7">
      {/* --- The programme itself -------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">The programme</legend>

        <Toggle
          name="affiliateProgramEnabled"
          value={settings.affiliateProgramEnabled}
          label="Affiliate programme is running"
          hint="Off closes the console to new attribution and hides the public pitch. Commission already earned still clears and still pays — it was earned."
        />
        <Toggle
          name="affiliateApplicationsOpen"
          value={settings.affiliateApplicationsOpen}
          label="Accepting applications"
          hint="Off leaves the programme open to existing sellers and bundle agents only."
        />
        <Toggle
          name="affiliateAutoApproveSellers"
          value={settings.affiliateAutoApproveSellers}
          label="Admit sellers without reviewing them"
          hint="They have been verified once already. Off sends them through the application queue like anybody else."
        />
        <Toggle
          name="affiliateAutoApproveAgents"
          value={settings.affiliateAutoApproveAgents}
          label="Admit data bundle agents without reviewing them"
        />
      </fieldset>

      {/* --- Attribution ------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">Referral attribution</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={field}>Attribution window (days)</span>
            <input
              name="affiliateAttributionWindowDays"
              type="number"
              min="1"
              max="365"
              defaultValue={settings.affiliateAttributionWindowDays}
              className={inputClass}
            />
            <span className={hint}>
              How long after a click a purchase is still credited to the affiliate. Snapshotted onto
              each referral when it is created, so shortening this never unpicks one already
              running.
            </span>
          </label>

          <label className="block">
            <span className={field}>When two affiliates refer the same shopper</span>
            <select
              name="affiliateAttributionModel"
              defaultValue={settings.affiliateAttributionModel}
              className={inputClass}
            >
              <option value="last">The most recent link wins (last click)</option>
              <option value="first">The first link wins (first click)</option>
            </select>
            <span className={hint}>
              Last click is the industry norm and rewards whoever brought the shopper back. First
              click rewards discovery.
            </span>
          </label>
        </div>
      </fieldset>

      {/* --- Commission and clearing ------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">Commission</legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={field}>Default rate (%)</span>
            <input
              name="affiliateRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={settings.affiliateRate}
              className={inputClass}
            />
            <span className={hint}>Used where neither the product nor its category sets one.</span>
          </label>

          <label className="block">
            <span className={field}>Headline rate (%)</span>
            <input
              name="affiliateMaxRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={settings.affiliateMaxRate}
              className={inputClass}
            />
            <span className={hint}>The &ldquo;earn up to X%&rdquo; figure in public copy.</span>
          </label>

          <label className="block">
            <span className={field}>Return window (days)</span>
            <input
              name="affiliateReturnWindowDays"
              type="number"
              min="0"
              max="180"
              defaultValue={settings.affiliateReturnWindowDays}
              className={inputClass}
            />
            <span className={hint}>
              How long after delivery commission is held before it can be paid. Zero pays on
              delivery and leaves nothing to claw back from.
            </span>
          </label>
        </div>

        <label className="block">
          <span className={field}>Public headline</span>
          <input
            name="affiliatePitch"
            defaultValue={settings.affiliatePitch}
            maxLength={200}
            className={inputClass}
          />
          <span className={hint}>
            <code className="font-mono">{"{rate}"}</code> is replaced with the headline rate.
          </span>
        </label>
      </fieldset>

      {/* --- Payouts ------------------------------------------------------ */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">Payouts</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={field}>Smallest payout (GH₵)</span>
            <input
              name="affiliateMinPayout"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.affiliateMinPayout}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={field}>Payout fee (GH₵)</span>
            <input
              name="affiliatePayoutFee"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.affiliatePayoutFee}
              className={inputClass}
            />
            <span className={hint}>Shown to the affiliate when they request one.</span>
          </label>
        </div>
      </fieldset>

      {/* --- Abuse -------------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">Abuse</legend>

        <Toggle
          name="affiliateBlockSelfReferral"
          value={settings.affiliateBlockSelfReferral}
          label="Refuse commission when the buyer is the affiliate"
          hint="There is no good reason to turn this off; it is here so you can see that it is on."
        />

        <label className="block max-w-xs">
          <span className={field}>Flag after this many orders per buyer per day</span>
          <input
            name="affiliateMaxOrdersPerVisitorPerDay"
            type="number"
            min="0"
            max="500"
            defaultValue={settings.affiliateMaxOrdersPerVisitorPerDay}
            className={inputClass}
          />
          <span className={hint}>
            Those orders still earn — they are put in front of you on the Abuse tab. Zero switches
            the check off.
          </span>
        </label>
      </fieldset>

      {/* --- What affiliates see ------------------------------------------ */}
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-niki-ink">What affiliates see</legend>

        <label className="block">
          <span className={field}>Default share caption</span>
          <textarea
            name="affiliateShareMessage"
            defaultValue={settings.affiliateShareMessage}
            rows={2}
            maxLength={600}
            className={inputClass}
          />
          <span className={hint}>
            Used until an affiliate writes their own.{" "}
            <code className="font-mono">{"{product}"}</code>,{" "}
            <code className="font-mono">{"{price}"}</code>,{" "}
            <code className="font-mono">{"{shop}"}</code> and{" "}
            <code className="font-mono">{"{link}"}</code> are filled in.
          </span>
        </label>

        <label className="block">
          <span className={field}>Programme terms</span>
          <textarea
            name="affiliateTerms"
            defaultValue={settings.affiliateTerms}
            rows={5}
            maxLength={5000}
            className={inputClass}
          />
          <span className={hint}>Shown on the affiliate&apos;s Help screen. Empty hides it.</span>
        </label>

        <label className="block max-w-sm">
          <span className={field}>Affiliate support WhatsApp</span>
          <input
            name="affiliateSupportWhatsapp"
            defaultValue={settings.affiliateSupportWhatsapp}
            maxLength={32}
            className={inputClass}
          />
          <span className={hint}>Empty falls back to the site-wide support contact.</span>
        </label>
      </fieldset>

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
        Save policy
      </button>
    </form>
  );
}

/**
 * A switch that submits "1" or "0".
 *
 * A bare checkbox submits nothing at all when it is off, and the settings
 * writer only touches keys the form actually sends — so an unchecked box would
 * silently leave the old value in place, which on "programme enabled" is the
 * difference between off and still running.
 *
 * The trailing hidden input is what makes "off" a value. The order matters: the
 * reader takes the *first* entry for a name, so the checkbox has to come first
 * (checked → "1" wins) and the fallback after it (unchecked → only "0" is
 * sent). Swapping them would pin the setting to off forever.
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
  const on = (value ?? "1").trim() !== "0";
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={on}
          className="mt-0.5 h-4 w-4 shrink-0 accent-niki-orange"
        />
        <span>
          <span className="block text-sm font-medium text-niki-ink/80">{label}</span>
          {hint ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-niki-ink/50">{hint}</span>
          ) : null}
        </span>
      </label>
      <input type="hidden" name={name} value="0" />
    </div>
  );
}
