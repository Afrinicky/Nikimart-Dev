"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { resetPassword, type ResetState } from "@/lib/reset-actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ResetState, FormData>(resetPassword, {});

  if (state.ok) {
    return (
      <div className="rounded-xl bg-niki-success/10 p-4 text-sm text-niki-ink">
        <p className="flex items-center gap-2 font-semibold text-niki-success">
          <CheckCircle2 className="h-5 w-5" /> Password updated
        </p>
        <p className="mt-2 text-niki-ink/70">You can now sign in with your new password.</p>
        <Link href="/login" className="mt-3 inline-block font-semibold text-niki-orange hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint={state.fieldErrors?.password ?? "At least 8 characters"}>
        <input id="password" name="password" type="password" required className={inputClass} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" hint={state.fieldErrors?.confirm}>
        <input id="confirm" name="confirm" type="password" required className={inputClass} />
      </Field>
      <SubmitButton>Set new password</SubmitButton>
    </form>
  );
}
