"use client";

import { useActionState } from "react";
import { Check, KeyRound } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  completeAgentSetup,
  type SetupState,
} from "@/lib/data-bundles/agent-application-actions";

/**
 * Redeeming an approved application: choose a password, confirm the store name,
 * and go live. The token rides along in a hidden field and is burned on use.
 */
export function AgentSetupForm({
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
  /** The name they asked for when they applied. Empty on older applications. */
  storeName: string;
  slug: string;
  origin: string;
}) {
  const [state, formAction] = useActionState<SetupState, FormData>(completeAgentSetup, {});

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">You&apos;re all set</p>
        <p className="mt-1 text-sm text-niki-ink/70">{state.message}</p>
        <ActionLink
          href="/login?callbackUrl=%2Fagent"
          className="mt-5 inline-flex rounded-full bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
        >
          Sign in to your store
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
        <p className="mt-2 font-mono text-xs text-niki-ink/60">
          {origin}/store/{slug}
        </p>
      </div>

      <Field
        label="Store name"
        htmlFor="storeName"
        hint="What customers see at the top of your store. You can change it later."
      >
        <input
          id="storeName"
          name="storeName"
          required
          // What they asked to be called. Older applications did not keep the
          // text, so those fall back to the slug they chose — still their
          // words, unlike a name built out of their own first name.
          defaultValue={storeName.trim() || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          className={inputClass}
        />
      </Field>

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
        pendingLabel="Opening your store…"
        icon={<KeyRound className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Set password and open my store
      </SubmitButton>
    </form>
  );
}
