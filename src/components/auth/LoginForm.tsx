"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { loginAction, type AuthFormState } from "@/lib/auth-actions";

export function LoginForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <Field label="Email address" htmlFor="email" hint={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
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
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
