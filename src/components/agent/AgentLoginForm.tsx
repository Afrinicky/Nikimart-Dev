"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { dataLoginAction, type DataAuthFormState } from "@/lib/data-bundles/sign-in-actions";

export function AgentLoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useActionState<DataAuthFormState, FormData>(dataLoginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <Field label="Email or phone number" htmlFor="identifier" hint={state.fieldErrors?.identifier}>
        <input
          id="identifier"
          name="identifier"
          type="text"
          defaultValue={state.values?.identifier ?? ""}
          key={state.values?.identifier ?? ""}
          autoComplete="username"
          required
          placeholder="you@example.com or 024 000 0000"
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password" hint={state.fieldErrors?.password}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>
      <FormFeedback error={state.error} />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
