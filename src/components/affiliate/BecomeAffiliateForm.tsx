"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { becomeAffiliate, type AffiliateState } from "@/lib/affiliate-actions";

export function BecomeAffiliateForm() {
  const [state, formAction] = useActionState<AffiliateState, FormData>(becomeAffiliate, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <Field label="Preferred referral code (optional)" htmlFor="code" hint="Letters & numbers, e.g. AMA10. We'll assign one if it's taken.">
        <input id="code" name="code" className={inputClass} placeholder="AMA10" />
      </Field>
      <SubmitButton>Become an affiliate</SubmitButton>
    </form>
  );
}
