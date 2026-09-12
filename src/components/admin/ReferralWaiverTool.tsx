"use client";

import { useActionState } from "react";
import { Percent } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatMoney } from "@/lib/format";
import {
  setAgentReferralWaiver,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";

/**
 * What this agent's own recruits pay to register, and how much of it comes
 * back to them.
 *
 * Two settings rather than one, because they are the two halves of the same
 * arrangement: the waiver decides what a recruit is charged, the share decides
 * who keeps it. Both are per agent so a good recruiter can be given something
 * to offer without changing what everybody else's code is worth.
 *
 * Blank is not zero. Blank follows the programme default as it changes; an
 * explicit 0 is a decision that outlives the default.
 */
export function ReferralWaiverTool({
  agentId,
  waiverPercent,
  sharePercent,
  defaultPercent,
  defaultSharePercent,
  registrationFee,
}: {
  agentId: string;
  /** Null when this agent follows the programme default. */
  waiverPercent: number | null;
  /** Null when this agent follows the programme default. */
  sharePercent: number | null;
  defaultPercent: number;
  defaultSharePercent: number;
  /** The registration fee as it stands, for the worked example. */
  registrationFee: number;
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(
    setAgentReferralWaiver,
    {},
  );

  const waiver = waiverPercent ?? defaultPercent;
  const share = sharePercent ?? defaultSharePercent;

  // The arithmetic, on the numbers in force right now. A percentage of a
  // percentage is hard to hold in your head, and this is money.
  const payable = Math.round(registrationFee * (1 - waiver / 100) * 100) / 100;
  const earns = Math.round(payable * (share / 100) * 100) / 100;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Percent className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">Their referral terms</h2>
          <p className="text-xs text-niki-ink/55">What people joining with this code pay.</p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="agentId" value={agentId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="referralWaiverPercent" className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">
              Waiver for recruits (%)
            </span>
            <input
              id="referralWaiverPercent"
              name="referralWaiverPercent"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={waiverPercent ?? ""}
              placeholder={`Default ${defaultPercent}%`}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-niki-ink/50">
              0 = full fee, 100 = free.
            </span>
          </label>

          <label htmlFor="referralSharePercent" className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">
              Their share of it (%)
            </span>
            <input
              id="referralSharePercent"
              name="referralSharePercent"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={sharePercent ?? ""}
              placeholder={`Default ${defaultSharePercent}%`}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-niki-ink/50">
              Of what a recruit pays, credited here.
            </span>
          </label>
        </div>

        {registrationFee > 0 ? (
          <dl className="space-y-1.5 rounded-xl bg-niki-surface px-4 py-3 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-niki-ink/55">Fee today</dt>
              <dd className="font-figures font-semibold text-niki-ink/75">
                {formatMoney(registrationFee)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-niki-ink/55">A recruit pays</dt>
              <dd className="font-figures font-semibold text-niki-ink">{formatMoney(payable)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-niki-ink/55">This agent earns</dt>
              <dd className="font-figures font-semibold text-niki-success">
                {formatMoney(earns)}
              </dd>
            </div>
          </dl>
        ) : null}

        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
        <SubmitButton
          pendingLabel="Saving…"
          className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
        >
          Save referral terms
        </SubmitButton>
        <p className="text-xs text-niki-ink/45">
          Blank follows the programme default. Applies to registrations from now on.
        </p>
      </form>
    </section>
  );
}
