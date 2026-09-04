"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { requestAffiliatePayout, type AffiliateState } from "@/lib/affiliate-actions";
import { FormFeedback } from "@/components/ui/FormFeedback";

export function RequestAffiliatePayoutForm({ available }: { available: number }) {
  const [state, formAction] = useActionState<AffiliateState, FormData>(requestAffiliatePayout, {});

  if (state.ok) {
    return (
      <p className="rounded-xl bg-niki-success/10 p-4 text-sm font-medium text-niki-success">
        Payout request submitted. Nickimart will process it and mark it paid once sent.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (GH₵)" htmlFor="amount" hint={`Up to ${available}`}>
          <input id="amount" name="amount" type="number" min="0" step="0.01" max={available} defaultValue={available > 0 ? available : ""} className={inputClass} />
        </Field>
        <Field label="Pay to (MoMo / bank)" htmlFor="reference" hint="Where should we send it?">
          <input id="reference" name="reference" placeholder="024 000 0000 (MTN)" className={inputClass} />
        </Field>
      </div>
      <input type="hidden" name="method" value="Mobile Money" />
      <FormFeedback error={state.error} />
      <div className="w-44">
        <SubmitButton>Request payout</SubmitButton>
      </div>
    </form>
  );
}
