"use client";

import { useActionState } from "react";
import { Check, KeyRound, ShieldCheck } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { setNewPassword, type NewPasswordState } from "@/lib/data-bundles/password-actions";

/**
 * The first thing an agent who was registered by somebody else ever does.
 *
 * One field they have to get right and one that proves they meant it. No
 * "current password": they are signed in with the one they were sent, and
 * asking them to type it again from a text message is an obstacle rather than
 * a check.
 */
export function NewPasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<NewPasswordState, FormData>(setNewPassword, {});

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">{state.message}</p>
        <ActionLink
          href="/agent"
          className="niki-press mt-5 inline-flex rounded-xl bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
        >
          Go to my store
        </ActionLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="flex items-start gap-3 rounded-2xl bg-niki-surface p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-niki-orange ring-1 ring-niki-edge">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-niki-ink">{email}</p>
          <p className="mt-0.5 text-xs text-niki-ink/60">
            You signed in with a password we sent you. Choose your own before you carry on — the
            old one stops working.
          </p>
        </div>
      </div>

      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <FormFeedback error={state.error} />
      <SubmitButton
        pendingLabel="Saving…"
        icon={<KeyRound className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Set my password
      </SubmitButton>
    </form>
  );
}
