"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { requestPasswordReset, type ResetState } from "@/lib/reset-actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ResetState, FormData>(requestPasswordReset, {});

  if (state.ok) {
    return (
      <div className="rounded-xl bg-niki-success/10 p-4 text-sm text-niki-ink">
        <p className="flex items-center gap-2 font-semibold text-niki-success">
          <MailCheck className="h-5 w-5" /> Check your phone and email
        </p>
        <p className="mt-2 text-niki-ink/70">
          If an account exists for that email, we&apos;ve sent a password-reset link. It&apos;s valid for one hour.
        </p>
        <Link href="/login" className="mt-3 inline-block font-semibold text-niki-orange hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <Field label="Email or phone number" htmlFor="email" hint={state.fieldErrors?.email}>
        <input id="email" name="email" type="text" required placeholder="you@example.com or 024 000 0000" className={inputClass} />
      </Field>
      <SubmitButton>Send reset link</SubmitButton>
      <p className="text-center text-sm text-niki-ink/60">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-niki-orange hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
