"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { updateDataSettings, type DataSettingsState } from "@/lib/data-bundles/settings-actions";
import type { DataSettings } from "@/lib/data-bundles/settings";

/**
 * Every number the referral programme pays out on, in one place.
 *
 * The whole point of this screen is that none of it is in the source code:
 * commissions are read from these values at the moment they are calculated, so
 * a rate change takes effect on the next sale with no deploy. Nothing already
 * earned moves — those amounts were snapshotted on the order or written into
 * the ledger when they were earned.
 *
 * The on/off switches are selects rather than checkboxes on purpose: an
 * unchecked checkbox isn't submitted at all, which would make "off" invisible
 * to an action that only writes the keys a form sent.
 */
export function ReferralSettingsForm({ settings }: { settings: DataSettings }) {
  const [state, formAction] = useActionState<DataSettingsState, FormData>(updateDataSettings, {});
  const on = (value: string) => (["0", "off", "false", "no"].includes(value.trim().toLowerCase()) ? "0" : "1");

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Programme</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Closing the programme stops new referral relationships being recorded and stops every
          reward and team commission being paid. Relationships already recorded, and everything
          already earned, are left exactly as they are.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Referral programme" htmlFor="referralEnabled">
            <select
              id="referralEnabled"
              name="referralEnabled"
              defaultValue={on(settings.referralEnabled)}
              className={inputClass}
            >
              <option value="1">Open — agents earn from their team</option>
              <option value="0">Closed — nothing new is recorded or paid</option>
            </select>
          </Field>
          <Field
            label="Second level"
            htmlFor="referralLevel2Enabled"
            hint="Turning this off leaves direct referrals paying as normal"
          >
            <select
              id="referralLevel2Enabled"
              name="referralLevel2Enabled"
              defaultValue={on(settings.referralLevel2Enabled)}
              className={inputClass}
            >
              <option value="1">On — a recruit&apos;s recruit pays the level above</option>
              <option value="0">Off — direct referrals only</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="What agents are told"
            htmlFor="referralPitch"
            hint="The line above the referral link on an agent's My Team screen"
          >
            <input
              id="referralPitch"
              name="referralPitch"
              defaultValue={settings.referralPitch}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Joining rewards</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Paid once per recruit, and only once that recruit&apos;s registration fee has actually been
          paid — whether they paid it up front or cleared it out of their commission.{" "}
          <strong className="font-semibold text-niki-ink">A fee you waive pays nobody.</strong> That
          is what stops invented accounts being worth creating.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Direct referral reward (GH₵)"
            htmlFor="referralLevel1Reward"
            hint="A recruits B — what A earns when B registers"
          >
            <input
              id="referralLevel1Reward"
              name="referralLevel1Reward"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.referralLevel1Reward}
              className={inputClass}
            />
          </Field>
          <Field
            label="Second-level reward (GH₵)"
            htmlFor="referralLevel2Reward"
            hint="B recruits C — what A earns when C registers"
          >
            <input
              id="referralLevel2Reward"
              name="referralLevel2Reward"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.referralLevel2Reward}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Most rewards one agent can be paid in 24 hours"
            htmlFor="referralDailyRewardCap"
            hint="0 removes the cap. Real recruiting doesn't arrive in bursts; anything held back is paid the next day, not lost."
          >
            <input
              id="referralDailyRewardCap"
              name="referralDailyRewardCap"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.referralDailyRewardCap}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Team-sales commission</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          What an agent earns on every qualifying sale by someone they recruited directly. Sales pay
          one level only: A earns from B&apos;s sales, B earns from C&apos;s, and A earns nothing
          from C&apos;s. Set the amount per bundle on the{" "}
          <strong className="font-semibold text-niki-ink">Bundle prices</strong> tab; the default
          below covers the bundles you haven&apos;t set one on.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Default per sale (GH₵)"
            htmlFor="referralTeamCommissionDefault"
            hint="Used when a bundle has no amount of its own. Zero on both pays nothing."
          >
            <input
              id="referralTeamCommissionDefault"
              name="referralTeamCommissionDefault"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.referralTeamCommissionDefault}
              className={inputClass}
            />
          </Field>
          <Field
            label="AFA registrations"
            htmlFor="referralAfaQualifies"
            hint="Whether an AFA sold by a recruit counts as a qualifying sale"
          >
            <select
              id="referralAfaQualifies"
              name="referralAfaQualifies"
              defaultValue={settings.referralAfaQualifies.trim() === "1" ? "1" : "0"}
              className={inputClass}
            >
              <option value="0">No — bundle sales only</option>
              <option value="1">Yes — AFA counts too</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">What counts as a sale</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          A sale has to clear both of these before it pays a team commission. Leave them at zero and
          every delivered sale qualifies. A failed, cancelled or refunded sale never pays, whatever
          these say.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum sale amount (GH₵)"
            htmlFor="referralMinSaleAmount"
            hint="Keeps a token order from paying out more than it was worth"
          >
            <input
              id="referralMinSaleAmount"
              name="referralMinSaleAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.referralMinSaleAmount}
              className={inputClass}
            />
          </Field>
          <Field
            label="Minimum commission to the seller (GH₵)"
            htmlFor="referralMinSaleCommission"
            hint="A bundle sold at cost earned nobody anything — set this above zero to exclude those, and the agents' own walk-in topups with them"
          >
            <input
              id="referralMinSaleCommission"
              name="referralMinSaleCommission"
              type="number"
              min="0"
              step="0.01"
              defaultValue={settings.referralMinSaleCommission}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <FormFeedback error={state.error} success={state.ok ? "Saved." : undefined} />
      <SubmitButton>Save referral settings</SubmitButton>
    </form>
  );
}
