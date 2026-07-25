"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { requestResetOtp, resetWithOtp, type ResetState } from "@/lib/reset-actions";

export function OtpResetFlow() {
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");

  const [reqState, requestAction] = useActionState<ResetState, FormData>(requestResetOtp, {});
  const [resetState, resetAction] = useActionState<ResetState, FormData>(resetWithOtp, {});

  useEffect(() => {
    if (reqState.ok) setStep(2);
  }, [reqState.ok]);

  if (resetState.ok) {
    return (
      <div className="rounded-xl bg-niki-success/10 p-4 text-sm text-niki-ink">
        <p className="flex items-center gap-2 font-semibold text-niki-success">
          <CheckCircle2 className="h-5 w-5" /> Password updated
        </p>
        <p className="mt-2 text-niki-ink/70">You can now sign in with your new password.</p>
        <Link href="/login" className="mt-3 inline-block font-semibold text-niki-orange hover:underline">Go to sign in</Link>
      </div>
    );
  }

  if (step === 2) {
    return (
      <form action={resetAction} className="space-y-4" noValidate>
        <p className="flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm text-niki-success">
          <MailCheck className="h-4 w-4" /> If that account exists, we sent a 6-digit code by SMS and email.
        </p>
        {resetState.error ? (
          <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{resetState.error}</p>
        ) : null}
        <input type="hidden" name="identifier" value={identifier} />
        <Field label="6-digit code" htmlFor="otp" hint={resetState.fieldErrors?.otp}>
          <input id="otp" name="otp" inputMode="numeric" maxLength={6} required placeholder="123456" className={`${inputClass} tracking-[0.4em]`} />
        </Field>
        <Field label="New password" htmlFor="password" hint={resetState.fieldErrors?.password ?? "At least 8 characters"}>
          <input id="password" name="password" type="password" required className={inputClass} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" hint={resetState.fieldErrors?.confirm}>
          <input id="confirm" name="confirm" type="password" required className={inputClass} />
        </Field>
        <SubmitButton>Set new password</SubmitButton>
        <p className="text-center text-sm text-niki-ink/60">
          Didn&apos;t get it?{" "}
          <button type="button" onClick={() => setStep(1)} className="font-semibold text-niki-orange hover:underline">Resend code</button>
        </p>
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-4" noValidate>
      {reqState.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{reqState.error}</p>
      ) : null}
      <Field label="Email or phone number" htmlFor="identifier" hint={reqState.fieldErrors?.identifier}>
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@example.com or 024 000 0000"
          className={inputClass}
        />
      </Field>
      <SubmitButton>Send reset code</SubmitButton>
      <p className="text-center text-sm text-niki-ink/60">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-niki-orange hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
