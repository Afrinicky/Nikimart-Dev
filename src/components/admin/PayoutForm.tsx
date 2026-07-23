"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function PayoutForm({
  action,
  hiddenName,
  hiddenValue,
  defaultAmount,
  cancelHref,
  submitLabel = "Record payment",
}: {
  action: Action;
  hiddenName: string;
  hiddenValue: string;
  defaultAmount?: number;
  cancelHref: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <input type="hidden" name={hiddenName} value={hiddenValue} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (GH₵)" htmlFor="amount" hint={state.fieldErrors?.amount}>
          <input id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={defaultAmount ?? ""} required className={inputClass} />
        </Field>
        <Field label="Method" htmlFor="method">
          <select id="method" name="method" defaultValue="Mobile Money" className={inputClass}>
            <option>Mobile Money</option>
            <option>Bank transfer</option>
            <option>Cash</option>
            <option>Other</option>
          </select>
        </Field>
      </div>

      <Field label="Reference (optional)" htmlFor="reference" hint="e.g. MoMo transaction id or bank reference.">
        <input id="reference" name="reference" className={inputClass} />
      </Field>

      <Field label="Note (optional)" htmlFor="note">
        <textarea id="note" name="note" rows={2} className={inputClass} />
      </Field>

      <div className="flex items-center gap-3">
        <div className="w-48">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href={cancelHref} className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">Cancel</Link>
      </div>
    </form>
  );
}
