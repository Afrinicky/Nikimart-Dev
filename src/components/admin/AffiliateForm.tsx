"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { createAffiliate } from "@/lib/finance-actions";
import type { CrudState } from "@/lib/admin-actions";

export function AffiliateForm() {
  const [state, formAction] = useActionState<CrudState, FormData>(createAffiliate, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint={state.fieldErrors?.name}>
          <input id="name" name="name" required className={inputClass} />
        </Field>
        <Field label="Referral code (optional)" htmlFor="code" hint={state.fieldErrors?.code ?? "A short unique code, e.g. AMA10"}>
          <input id="code" name="code" className={inputClass} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone">
          <input id="phone" name="phone" className={inputClass} />
        </Field>
        <Field label="Email (optional)" htmlFor="email">
          <input id="email" name="email" type="email" className={inputClass} />
        </Field>
      </div>

      <Field label="Note (optional)" htmlFor="note">
        <textarea id="note" name="note" rows={2} className={inputClass} />
      </Field>

      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>Add affiliate</SubmitButton>
        </div>
        <Link href="/admin/finance/affiliates" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">Cancel</Link>
      </div>
    </form>
  );
}
