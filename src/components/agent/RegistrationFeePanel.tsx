"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { payRegistrationFee } from "@/lib/data-bundles/agent-actions";

/**
 * Paying the registration fee, for an agent who chose to pay it up front.
 *
 * It matters beyond their own balance: the fee is what releases the referral
 * reward to whoever recruited them, so the panel says so. An agent who does not
 * know that has no reason to hurry, and the person who brought them on board is
 * left wondering where their money is.
 */
export function RegistrationFeePanel({ amount }: { amount: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pay() {
    setError(null);
    start(async () => {
      const result = await payRegistrationFee();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Paystack hosts the payment; without keys configured it settles on the
      // spot and there is nowhere to send them but back to this page.
      if (result.authorizationUrl) window.location.href = result.authorizationUrl;
      else window.location.reload();
    });
  }

  return (
    <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <p className="text-sm font-semibold text-amber-900">
        Your registration fee of {amount} is still outstanding.
      </p>
      <p className="mt-1 text-sm text-amber-800">
        You chose to pay it up front rather than clear it out of your commission. Paying it opens
        your balance at zero — and it is what pays the agent who recruited you, so they are waiting
        on it too.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        aria-busy={pending || undefined}
        className="niki-press niki-focus mt-4 flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Starting payment…" : `Pay ${amount} now`}
      </button>
    </div>
  );
}
