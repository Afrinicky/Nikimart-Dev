"use client";

import { useActionState } from "react";
import { Check, KeyRound } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  completeRecruitSetup,
  type SetupState,
} from "@/lib/data-bundles/agent-application-actions";

/**
 * Choosing a password on a registration that is still waiting for approval.
 *
 * Somebody an agent registered never filled in a form, so this is the only
 * place they get to choose one. Nothing goes live here — the store opens when
 * an admin approves it, and this password is what they sign in with then.
 */
export function RecruitSetupForm({
  token,
  fullName,
  email,
  storeName,
  slug,
  origin,
}: {
  token: string;
  fullName: string;
  email: string;
  storeName: string;
  slug: string;
  origin: string;
}) {
  const [state, formAction] = useActionState<SetupState, FormData>(completeRecruitSetup, {});

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">Password set</p>
        <p className="mt-1 text-sm text-niki-ink/70">{state.message}</p>
        <ActionLink
          href="/"
          className="mt-5 inline-flex rounded-full bg-niki-black px-6 py-3 text-sm font-bold text-white"
        >
          Back to Nickimart
        </ActionLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div className="rounded-2xl bg-niki-surface p-4 text-sm">
        <p className="font-semibold text-niki-ink">{fullName}</p>
        <p className="text-niki-ink/60">{email}</p>
        <p className="mt-2 text-xs text-niki-ink/60">
          {storeName.trim() || "Your store"} ·{" "}
          <span className="font-mono">
            {origin.replace(/^https?:\/\//, "")}/store/{slug}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="password" hint="At least 6 characters.">
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>

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
