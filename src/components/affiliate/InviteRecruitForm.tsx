"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { inviteRecruit, type ActionState } from "@/lib/affiliate-console-actions";

/**
 * Send somebody the link, rather than hoping they keep the WhatsApp message.
 *
 * A name is optional and the contact is not: what this does is deliver one
 * link to one person, so the only thing it genuinely needs is where to send
 * it.
 */
export function InviteRecruitForm() {
  const [state, action] = useActionState<ActionState, FormData>(inviteRecruit, {});

  return (
    <form action={action} className="space-y-2.5">
      <input name="name" maxLength={80} placeholder="Their name (optional)" className={inputClass} />
      <input name="phone" type="tel" maxLength={32} placeholder="024 000 0000" className={inputClass} />
      <input name="email" type="email" maxLength={120} placeholder="Email (optional)" className={inputClass} />

      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-3 py-2 text-xs font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-niki-success/10 px-3 py-2 text-xs font-medium text-niki-success">
          {state.message}
        </p>
      ) : null}

      <SubmitButton
        pendingLabel="Sending…"
        className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-bold text-white hover:bg-niki-black-mute"
      >
        Send them the link
      </SubmitButton>
    </form>
  );
}
