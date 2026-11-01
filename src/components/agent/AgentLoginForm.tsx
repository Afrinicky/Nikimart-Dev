"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  dataLoginAction,
  dataVerifyTwoFactorAction,
  type DataAuthFormState,
} from "@/lib/data-bundles/sign-in-actions";
import { ShieldCheck } from "lucide-react";

export function AgentLoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useActionState<DataAuthFormState, FormData>(dataLoginAction, {});

  // The password was right and a code is out. Swapping the form rather than
  // showing a second one keeps the password field off the screen entirely —
  // there is nothing left to retype, and nothing left to steal from it.
  if (state.twoFactor) {
    return (
      <CodeStep
        twoFactor={state.twoFactor}
        identifier={state.values?.identifier}
        callbackUrl={callbackUrl}
      />
    );
  }

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

function CodeStep({
  twoFactor,
  identifier,
  callbackUrl,
}: {
  twoFactor: NonNullable<DataAuthFormState["twoFactor"]>;
  identifier?: string;
  callbackUrl?: string;
}) {
  const [state, formAction] = useActionState<DataAuthFormState, FormData>(
    dataVerifyTwoFactorAction,
    { twoFactor },
  );
  const current = state.twoFactor ?? twoFactor;

  return (
    <form action={formAction} className="animate-fade-up mt-6 space-y-4" noValidate>
      <input type="hidden" name="challengeId" value={current.challengeId} />
      <input type="hidden" name="channel" value={current.channel} />
      <input type="hidden" name="hint" value={current.hint} />
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      <div className="flex items-start gap-3 rounded-2xl bg-niki-surface px-4 py-3.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-niki-orange" />
        <p className="text-sm text-niki-ink/70">
          We sent a 6-digit code to {current.hint}. It expires in 10 minutes.
        </p>
      </div>

      <Field label="Sign-in code" htmlFor="code" hint={state.fieldErrors?.code}>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className={`${inputClass} text-center font-figures text-lg font-bold tracking-[0.4em]`}
        />
      </Field>

      <FormFeedback error={state.error} />
      <SubmitButton>Verify and sign in</SubmitButton>

      <a
        href={`/agent-login${identifier ? `?identifier=${encodeURIComponent(identifier)}` : ""}`}
        className="niki-focus block text-center text-sm font-medium text-niki-ink/55 hover:text-niki-orange"
      >
        Start again
      </a>
    </form>
  );
}
