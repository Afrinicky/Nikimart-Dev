"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatMoney } from "@/lib/format";
import {
  updateWithdrawalAmount,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";

/**
 * Pay out something other than what was asked for.
 *
 * Folded away until it is wanted: nine requests in ten are sent exactly as
 * they came, and an open form over the figure you are about to read into a
 * MoMo app is an invitation to fat-finger it.
 *
 * The reason is required because the difference moves the agent's balance, and
 * a balance that moved for a reason nobody wrote down is a support call.
 */
export function WithdrawalAmountForm({
  withdrawalId,
  amount,
  available,
}: {
  withdrawalId: string;
  amount: number;
  /** The agent's balance, so raising the amount can be weighed before saving. */
  available: number;
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(
    updateWithdrawalAmount,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open && !state.ok) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-focus mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-niki-trust hover:underline"
      >
        <Pencil className="h-3.5 w-3.5" />
        Change the amount
      </button>
    );
  }

  return (
    <form action={formAction} className="animate-fade-up mt-4 space-y-3 rounded-xl bg-niki-surface p-4">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="withdrawalAmount" className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Pay out instead (GH₵)
          </span>
          <input
            id="withdrawalAmount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={amount}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">
            They asked for {formatMoney(amount)} · balance {formatMoney(available)}
          </span>
        </label>

        <label htmlFor="withdrawalReason" className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Why</span>
          <input
            id="withdrawalReason"
            name="reason"
            placeholder="Float short this morning"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">
            Kept on the record with the payout.
          </span>
        </label>
      </div>

      <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-press niki-focus rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
        >
          {state.ok ? "Done" : "Cancel"}
        </button>
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
        >
          Save amount
        </SubmitButton>
      </div>
      <p className="text-xs text-niki-ink/45">
        Lowering it returns the difference to their balance; raising it takes the extra.
      </p>
    </form>
  );
}
