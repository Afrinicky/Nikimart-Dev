"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { sendCollectionCode, type ReleaseState } from "@/lib/pickup-actions";

/**
 * Send the buyer their collection code again.
 *
 * The one thing an admin genuinely needs to do about a pickup from a desk: a
 * buyer rings to say they deleted the text, or changed their number, and the
 * answer should not be a developer. Releasing the parcel still happens at the
 * counter, where somebody can look at who is asking.
 */
export function SendCodeButton({ orderId, again }: { orderId: string; again: boolean }) {
  const [state, action] = useActionState<ReleaseState, FormData>(sendCollectionCode, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton
        pendingLabel="Sending…"
        className="flex items-center gap-1.5 rounded-xl bg-niki-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-niki-black-soft"
      >
        <Send className="h-3.5 w-3.5" />
        {again ? "Send the code again" : "Send a collection code"}
      </SubmitButton>
      <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
    </form>
  );
}
