"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { requestSellerPayout, type PayoutRequestState } from "@/lib/seller-actions";

export function RequestPayoutForm({ available, hasPayoutDetails }: { available: number; hasPayoutDetails: boolean }) {
  const [state, formAction] = useActionState<PayoutRequestState, FormData>(requestSellerPayout, {});

  if (!hasPayoutDetails) {
    return (
      <p className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/70">
        Add your Mobile Money or bank details in{" "}
        <Link href="/seller/settings" className="font-semibold text-niki-orange hover:underline">Shop settings</Link>{" "}
        to request payouts.
      </p>
    );
  }

  if (state.ok) {
    return (
      <p className="rounded-xl bg-niki-success/10 p-4 text-sm font-medium text-niki-success">
        Payout request submitted. NikiMart will process it and mark it paid once sent.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error ? (
        <p role="alert" className="w-full rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <div className="w-40">
        <Field label="Amount (GH₵)" htmlFor="amount" hint={`Up to ${available}`}>
          <input id="amount" name="amount" type="number" min="0" step="0.01" max={available} defaultValue={available > 0 ? available : ""} className={inputClass} />
        </Field>
      </div>
      <div className="w-40">
        <SubmitButton>Request payout</SubmitButton>
      </div>
    </form>
  );
}
