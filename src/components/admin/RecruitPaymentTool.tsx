"use client";

import { useActionState } from "react";
import { CreditCard } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  setAgentRecruitPaymentMode,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";
import { paymentModeLabel, type PaymentMode } from "@/lib/data-bundles/payment-mode";

/**
 * How the people this agent recruits settle their registration fee.
 *
 * The exception to the programme's own rule, written against one agent:
 * "everyone pays up front, except the people this agent brings in". Blank
 * follows the programme as it changes, which is not the same as picking
 * whatever the programme happens to say today.
 *
 * It does nothing at all while per-agent exceptions are switched off under
 * Programme settings, and says so rather than letting an admin set something
 * that quietly has no effect.
 */
export function RecruitPaymentTool({
  agentId,
  mode,
  programMode,
  allowed,
}: {
  agentId: string;
  /** Null when this agent follows the programme. */
  mode: string | null;
  programMode: PaymentMode;
  /** False when the admin has switched per-agent exceptions off. */
  allowed: boolean;
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(
    setAgentRecruitPaymentMode,
    {},
  );

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <CreditCard className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">How their recruits pay</h2>
          <p className="text-xs text-niki-ink/55">
            Programme rule: {paymentModeLabel(programMode).toLowerCase()}.
          </p>
        </div>
      </div>

      {!allowed ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Per-agent exceptions are switched off, so everyone follows the programme rule above.
          Turn them on under Programme settings to use this.
        </p>
      ) : null}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="agentId" value={agentId} />

        <label htmlFor="recruitPaymentMode" className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            People registering under this agent
          </span>
          <select
            id="recruitPaymentMode"
            name="recruitPaymentMode"
            defaultValue={(mode ?? "").toUpperCase()}
            disabled={!allowed}
            className={inputClass}
          >
            <option value="">Follow the programme</option>
            <option value="UPFRONT">Pay up front — before the store opens</option>
            <option value="COMMISSION">Pay from commission — nothing up front</option>
            <option value="BOTH">Either — whoever registers them chooses</option>
          </select>
        </label>

        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />

        <SubmitButton
          pendingLabel="Saving…"
          disabled={!allowed}
          className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-bold text-white hover:bg-niki-black-mute disabled:opacity-40"
        >
          Save
        </SubmitButton>
      </form>
    </section>
  );
}
