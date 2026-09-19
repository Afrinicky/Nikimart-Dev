"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { scheduleSession, type SessionState } from "@/lib/data-bundles/team/session-actions";
import { cn } from "@/lib/cn";

/** Put a session in the diary. Folded away until a leader wants one. */
export function SessionScheduler() {
  const [state, formAction] = useActionState<SessionState, FormData>(scheduleSession, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex shrink-0 items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2 text-xs font-bold text-white hover:bg-niki-orange-light"
      >
        <Plus className="h-3.5 w-3.5" />
        Schedule a session
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="animate-fade-up w-full space-y-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <CalendarPlus className="h-4 w-4" />
        </span>
        <h2 className="font-display font-bold text-niki-ink">New session</h2>
      </div>

      <input name="title" required maxLength={80} placeholder="Title" className={inputClass} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Starts</span>
        <input type="datetime-local" name="startsAt" required className={inputClass} />
      </label>
      <textarea
        name="agenda"
        rows={3}
        maxLength={1000}
        placeholder="What will you cover? (optional)"
        className={cn(inputClass, "resize-y")}
      />

      <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-press niki-focus rounded-xl bg-niki-surface px-4 py-2.5 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5"
        >
          {state.ok ? "Done" : "Cancel"}
        </button>
        <SubmitButton
          pendingLabel="Scheduling…"
          className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Schedule it
        </SubmitButton>
      </div>
    </form>
  );
}
