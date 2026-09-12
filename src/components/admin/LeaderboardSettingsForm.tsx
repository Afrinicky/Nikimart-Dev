"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { updateDataSettings, type DataSettingsState } from "@/lib/data-bundles/settings-actions";
import type { DataSettings } from "@/lib/data-bundles/settings";

/**
 * Every number the leaderboard runs on, in one place.
 *
 * Nothing about the boards is in the source: what they rank over, who is
 * allowed on them, what a place pays and how many points a reward costs are
 * all read at the moment they are used. Change one here and the next board
 * drawn or the next period paid uses it, with no deploy. Points already
 * awarded are in the points ledger and never move.
 *
 * The on/off switches are selects rather than checkboxes on purpose: an
 * unchecked checkbox isn't submitted at all, which would make "off" invisible
 * to an action that only writes the keys a form sent.
 */
export function LeaderboardSettingsForm({ settings }: { settings: DataSettings }) {
  const [state, formAction] = useActionState<DataSettingsState, FormData>(updateDataSettings, {});
  const on = (value: string) =>
    ["0", "off", "false", "no"].includes(value.trim().toLowerCase()) ? "0" : "1";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">The whole feature</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          One switch for boards, points and rewards together. Off hides the leaderboard from every
          agent screen and stops points being awarded. Points already earned stay where they are,
          and turning it back on picks up exactly where it left off.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Leaderboard &amp; rewards" htmlFor="leaderboardEnabled">
            <select
              id="leaderboardEnabled"
              name="leaderboardEnabled"
              defaultValue={on(settings.leaderboardEnabled)}
              className={inputClass}
            >
              <option value="1">On — agents see the boards and earn points</option>
              <option value="0">Off — hidden everywhere</option>
            </select>
          </Field>
          <Field
            label="Ranking period"
            htmlFor="leaderboardPeriod"
            hint="What the boards count, and the period whose close pays out places"
          >
            <select
              id="leaderboardPeriod"
              name="leaderboardPeriod"
              defaultValue={settings.leaderboardPeriod.trim().toUpperCase() || "MONTH"}
              className={inputClass}
            >
              <option value="WEEK">Weekly — resets every Monday</option>
              <option value="MONTH">Monthly — resets on the 1st</option>
              <option value="ALL">All time — never resets, and pays no place points</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Rows on the full board"
            htmlFor="leaderboardSize"
            hint="The dashboard always shows the top 3 and the agent's own neighbours, whatever this says"
          >
            <input
              id="leaderboardSize"
              name="leaderboardSize"
              type="number"
              min="3"
              max="100"
              step="1"
              defaultValue={settings.leaderboardSize}
              className={inputClass}
            />
          </Field>
          <Field
            label="What agents are told"
            htmlFor="leaderboardPitch"
            hint="The line above the boards on an agent's leaderboard screen"
          >
            <input
              id="leaderboardPitch"
              name="leaderboardPitch"
              defaultValue={settings.leaderboardPitch}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Which boards</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Only successful business is counted: a sale is an order that was paid for and delivered,
          and a recruit counts once their registration is settled. Turning a board off also stops
          it paying points.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Top Sales" htmlFor="leaderboardSalesEnabled">
            <select
              id="leaderboardSalesEnabled"
              name="leaderboardSalesEnabled"
              defaultValue={on(settings.leaderboardSalesEnabled)}
              className={inputClass}
            >
              <option value="1">Shown</option>
              <option value="0">Hidden</option>
            </select>
          </Field>
          <Field label="Top Recruiters" htmlFor="leaderboardRecruitsEnabled">
            <select
              id="leaderboardRecruitsEnabled"
              name="leaderboardRecruitsEnabled"
              defaultValue={on(settings.leaderboardRecruitsEnabled)}
              className={inputClass}
            >
              <option value="1">Shown</option>
              <option value="0">Hidden</option>
            </select>
          </Field>
          <Field label="Current Performance" htmlFor="leaderboardPerformanceEnabled">
            <select
              id="leaderboardPerformanceEnabled"
              name="leaderboardPerformanceEnabled"
              defaultValue={on(settings.leaderboardPerformanceEnabled)}
              className={inputClass}
            >
              <option value="1">Shown</option>
              <option value="0">Hidden</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Current Performance</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The board that lets a newer agent compete with an established one: it counts only the
          recent window, so lifetime totals don&apos;t decide it. The two bars below are what keep
          it honest — an account that opened yesterday with two sales should not be able to top it.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Performance window (days)"
            htmlFor="leaderboardWindowDays"
            hint="How far back “recent” reaches"
          >
            <input
              id="leaderboardWindowDays"
              name="leaderboardWindowDays"
              type="number"
              min="1"
              step="1"
              defaultValue={settings.leaderboardWindowDays}
              className={inputClass}
            />
          </Field>
          <Field
            label="Minimum agent age (days)"
            htmlFor="leaderboardMinAgentAgeDays"
            hint="How long an agent must have been trading to be eligible"
          >
            <input
              id="leaderboardMinAgentAgeDays"
              name="leaderboardMinAgentAgeDays"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardMinAgentAgeDays}
              className={inputClass}
            />
          </Field>
          <Field
            label="Minimum qualifying sales"
            htmlFor="leaderboardMinQualifyingSales"
            hint="Delivered sales inside the window before they appear"
          >
            <input
              id="leaderboardMinQualifyingSales"
              name="leaderboardMinQualifyingSales"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardMinQualifyingSales}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Points</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Paid once, when a ranking period closes, on every board that is switched on. Set a place
          to zero and it pays nothing. An all-time ranking period never closes, so it pays no place
          points at all.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="1st place" htmlFor="leaderboardPoints1st">
            <input
              id="leaderboardPoints1st"
              name="leaderboardPoints1st"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardPoints1st}
              className={inputClass}
            />
          </Field>
          <Field label="2nd place" htmlFor="leaderboardPoints2nd">
            <input
              id="leaderboardPoints2nd"
              name="leaderboardPoints2nd"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardPoints2nd}
              className={inputClass}
            />
          </Field>
          <Field label="3rd place" htmlFor="leaderboardPoints3rd">
            <input
              id="leaderboardPoints3rd"
              name="leaderboardPoints3rd"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardPoints3rd}
              className={inputClass}
            />
          </Field>
        </div>

        <p className="mt-6 text-sm text-niki-ink/60">
          Current Performance also pays for the figure itself, not just the place — an agent can
          have an exceptional month and still come fourth. Set a sales bar to zero to switch that
          grade off entirely.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Excellent from (sales)" htmlFor="leaderboardExcellentSales">
            <input
              id="leaderboardExcellentSales"
              name="leaderboardExcellentSales"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardExcellentSales}
              className={inputClass}
            />
          </Field>
          <Field label="Excellent pays" htmlFor="leaderboardExcellentPoints">
            <input
              id="leaderboardExcellentPoints"
              name="leaderboardExcellentPoints"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardExcellentPoints}
              className={inputClass}
            />
          </Field>
          <Field label="Exceptional from (sales)" htmlFor="leaderboardExceptionalSales">
            <input
              id="leaderboardExceptionalSales"
              name="leaderboardExceptionalSales"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardExceptionalSales}
              className={inputClass}
            />
          </Field>
          <Field label="Exceptional pays" htmlFor="leaderboardExceptionalPoints">
            <input
              id="leaderboardExceptionalPoints"
              name="leaderboardExceptionalPoints"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.leaderboardExceptionalPoints}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Redeeming</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Closing the shelf leaves the boards and the points running while nothing can be claimed —
          which is what you want while the rewards below are being set up. The rewards themselves,
          and what they cost, are set underneath.
        </p>
        <div className="mt-4 sm:max-w-sm">
          <Field label="Redeeming" htmlFor="leaderboardRewardsEnabled">
            <select
              id="leaderboardRewardsEnabled"
              name="leaderboardRewardsEnabled"
              defaultValue={on(settings.leaderboardRewardsEnabled)}
              className={inputClass}
            >
              <option value="1">Open — agents can claim rewards</option>
              <option value="0">Closed — points keep adding up</option>
            </select>
          </Field>
        </div>
      </section>

      <FormFeedback error={state.error} success={state.ok ? "Saved." : undefined} />
      <SubmitButton>Save leaderboard settings</SubmitButton>
    </form>
  );
}
