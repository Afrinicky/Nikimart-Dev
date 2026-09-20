"use client";

import { useActionState, useState } from "react";
import { DoorOpen } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { requestToJoin, type ChatState } from "@/lib/chat/actions";
import { cn } from "@/lib/cn";

/**
 * Ask to be let in.
 *
 * With a line about why, because the owner deciding is a person who has to
 * recognise you — a bare name and a yes/no is a decision made blind.
 */
export function RequestToJoin({ conversationId }: { conversationId: string }) {
  const [state, formAction] = useActionState<ChatState, FormData>(requestToJoin, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <span className="shrink-0 rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
        Request sent
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
      >
        <DoorOpen className="h-3.5 w-3.5" />
        Ask to join
      </button>
    );
  }

  return (
    <form action={formAction} className="animate-fade-up flex w-full flex-col gap-2 sm:flex-row">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input
        name="message"
        maxLength={300}
        placeholder="Why do you want to join?"
        className={cn(inputClass, "flex-1 py-2 text-xs")}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-press niki-focus rounded-xl bg-niki-surface px-3.5 py-2 text-xs font-bold text-niki-ink/70"
        >
          Cancel
        </button>
        <SubmitButton
          pendingLabel="Sending…"
          className="rounded-xl bg-niki-black px-4 py-2 text-xs font-bold text-white"
        >
          Send
        </SubmitButton>
      </div>
      <FormFeedback error={state.error} />
    </form>
  );
}
