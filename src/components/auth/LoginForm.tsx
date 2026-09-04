"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { loginAction, type AuthFormState } from "@/lib/auth-actions";
import { FormFeedback } from "@/components/ui/FormFeedback";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <Field label="Email or phone number" htmlFor="email" hint={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="text"
          defaultValue={state.values?.email ?? ""}
          key={state.values?.email ?? ""}
          autoComplete="username"
          required
          placeholder="you@example.com or 024 000 0000"
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password" hint={state.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>
      <FormFeedback error={state.error} />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
