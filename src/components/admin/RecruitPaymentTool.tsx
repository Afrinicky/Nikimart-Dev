"use client";

import { useActionState, useRef } from "react";
import { CreditCard } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
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
 * "everyone pays up front, except the people this agent brings in".
 *
 * It saves the moment the choice is made, with no Save button. That is not a
 * flourish — a select and a separate button is how a setting gets chosen and
 * then left unsaved, and the whole failure this control has to rule out is an
 * exception that looks set and does nothing. What is on screen is what is in
 * the database, and the line underneath says so in words.
 *
 * Blank follows the programme as it changes, which is not the same as picking
 * whatever the programme happens to say today. And the whole thing is inert
 * while per-agent exceptions are switched off — it says so rather than letting
 * an admin set something that quietly has no effect.
 */
export function RecruitPaymentTool({
  agentId,
  mode,
  programMode,
  allowed,
}: {
  agentId: string;
  /** What is stored on the agent. Null when they follow the programme. */
  mode: string | null;
  programMode: PaymentMode;
  /** False when the admin has switched per-agent exceptions off. */
  allowed: boolean;
}) {
  const [state, formAction, pending] = useActionState<AgentAdminState, FormData>(
    setAgentRecruitPaymentMode,
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  const stored = (mode ?? "").toUpperCase();

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

      <form ref={form} action={formAction} className="mt-4 space-y-2">
        <input type="hidden" name="agentId" value={agentId} />

        <label htmlFor="recruitPaymentMode" className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            People registering under this agent
          </span>
          <select
            id="recruitPaymentMode"
            name="recruitPaymentMode"
            // Keyed on what is stored, so a value written by this form — or by
            // anybody else — replaces whatever is on screen rather than being
            // masked by a stale uncontrolled default.
            key={stored}
            defaultValue={stored}
            disabled={!allowed || pending}
            onChange={() => form.current?.requestSubmit()}
            className={inputClass}
          >
            <option value="">Follow the programme</option>
            <option value="UPFRONT">Pay up front — before the store opens</option>
            <option value="COMMISSION">Pay from commission — nothing up front</option>
            <option value="BOTH">Either — whoever registers them chooses</option>
          </select>
        </label>

        <p className="text-xs text-niki-ink/50">
          {pending
            ? "Saving…"
            : stored
              ? `Stored on this agent: ${paymentModeLabel(stored as PaymentMode).toLowerCase()}.`
              : "Nothing stored on this agent — they follow the programme."}
        </p>

        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
      </form>
    </section>
  );
}
