"use client";

import { useActionState } from "react";
import { Percent } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  setAgentReferralWaiver,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";

/**
 * The discount this agent's own recruits get on their registration fee.
 *
 * Per agent rather than per programme, because it is a reward for recruiting
 * well: a good recruiter can be given something to offer, without changing
 * what everybody else's code is worth.
 *
 * Blank is not zero. Blank follows the programme default as it changes; an
 * explicit 0% means this agent's code never discounts anything, whatever the
 * default becomes. The field says so, because the difference only shows up
 * weeks later when somebody changes the default.
 */
export function ReferralWaiverTool({
  agentId,
  waiverPercent,
  defaultPercent,
  referrerSharePercent,
}: {
  agentId: string;
  /** Null when this agent follows the programme default. */
  waiverPercent: number | null;
  defaultPercent: number;
  /** The share of what a recruit pays that comes back to this agent. */
  referrerSharePercent: number;
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(
    setAgentReferralWaiver,
    {},
  );
  const effective = waiverPercent ?? defaultPercent;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Percent className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">Waiver for their recruits</h2>
          <p className="text-xs text-niki-ink/55">
            {effective >= 100
              ? "Anyone joining with this code registers free"
              : effective > 0
                ? `${effective}% off the registration fee`
                : "No discount on the registration fee"}
            {waiverPercent === null ? " (programme default)" : ""}
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="agentId" value={agentId} />
        <label htmlFor="referralWaiverPercent" className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Waiver (%)</span>
          <input
            id="referralWaiverPercent"
            name="referralWaiverPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={waiverPercent ?? ""}
            placeholder={`Blank — follow the default (${defaultPercent}%)`}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">
            0 is no discount, 100 registers them free. Leave it blank to follow the programme
            default as it changes.
          </span>
        </label>

        {referrerSharePercent > 0 ? (
          <p className="rounded-xl bg-niki-surface px-3 py-2.5 text-xs text-niki-ink/60">
            This agent is also credited {referrerSharePercent}% of whatever their recruits do pay,
            once that payment clears.
          </p>
        ) : null}

        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
        <SubmitButton
          pendingLabel="Saving…"
          className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
        >
          Save waiver
        </SubmitButton>
        <p className="text-xs text-niki-ink/45">
          Applies to registrations from now on. A recruit already approved keeps the fee they were
          quoted.
        </p>
      </form>
    </section>
  );
}
