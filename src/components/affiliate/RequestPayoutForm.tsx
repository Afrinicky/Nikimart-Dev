"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import { requestPayout, type ActionState } from "@/lib/affiliate-console-actions";
import { inputClass } from "@/components/ui/Field";
import { formatMoney } from "@/lib/format";

/**
 * Asking to be paid.
 *
 * The amount is checked on the server against the commission ledger, so the
 * figure in this box is a convenience rather than a claim. What it has to do
 * is stop somebody asking for an amount that will be refused: the available
 * balance is the maximum, the programme minimum is the floor, and both are
 * printed rather than left to be discovered.
 */
export function RequestPayoutForm({
  available,
  minimum,
  fee,
  hasPayoutDetails,
  openRequest,
}: {
  available: number;
  minimum: number;
  fee: number;
  hasPayoutDetails: boolean;
  /** True when one is already awaiting a decision. */
  openRequest: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPayout, {});

  if (!hasPayoutDetails) {
    return (
      <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
        Add the Mobile Money or bank details your payout should go to in{" "}
        <Link href="/affiliate/settings" className="font-semibold underline">
          Settings
        </Link>{" "}
        first.
      </p>
    );
  }

  if (openRequest) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65 ring-1 ring-niki-edge">
        You have a payout request awaiting review. Once it&apos;s settled you can request the next
        one.
      </p>
    );
  }

  if (available < minimum) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65 ring-1 ring-niki-edge">
        The smallest payout is {formatMoney(minimum)} — you have {formatMoney(available)} cleared so
        far. Commission clears once a referred order has been delivered and its return window has
        closed.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Amount (GH₵)</span>
          <input
            name="amount"
            type="number"
            min={minimum}
            max={available}
            step="0.01"
            defaultValue={available.toFixed(2)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
            Note <span className="text-xs font-normal text-niki-ink/45">(optional)</span>
          </span>
          <input
            name="note"
            maxLength={300}
            placeholder="Anything we should know about this payout"
            className={inputClass}
          />
        </label>
      </div>

      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/20">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Request payout
        </button>
        <p className="text-xs text-niki-ink/50">
          Up to {formatMoney(available)} available
          {fee > 0 ? ` · ${formatMoney(fee)} payout fee` : ""}
        </p>
      </div>
    </form>
  );
}
