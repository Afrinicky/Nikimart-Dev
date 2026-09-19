"use client";

import { useActionState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatWhen } from "@/components/agent/AgentUi";
import {
  addMemberNote,
  deleteMemberNote,
  type TeamActionState,
} from "@/lib/data-bundles/team/actions";
import type { TeamNote } from "@/lib/data-bundles/team/communication";
import { cn } from "@/lib/cn";

/**
 * A leader's own notes on one member.
 *
 * Mentorship is mostly remembering: what was agreed last time, what they were
 * struggling with, what they asked for. Private to the leader who wrote them —
 * a member reading their own coaching notes changes what gets written down,
 * and then the notes stop being worth writing.
 */
export function MemberNotes({ memberId, notes }: { memberId: string; notes: TeamNote[] }) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(addMemberNote, {});

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <NotebookPen className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">Your notes</h2>
          <p className="text-xs text-niki-ink/55">Only you can see these.</p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="memberId" value={memberId} />
        <textarea
          name="body"
          required
          rows={3}
          maxLength={1000}
          placeholder="What did you agree? What are they working on?"
          className={cn(inputClass, "resize-y")}
        />
        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Save note
        </SubmitButton>
      </form>

      {notes.length > 0 ? (
        <ul className="mt-4 divide-y divide-niki-edge">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm text-niki-ink/75">{n.body}</p>
                <p className="mt-1 text-[11px] text-niki-ink/40">{formatWhen(n.createdAt)}</p>
              </div>
              <form action={deleteMemberNote}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="memberId" value={memberId} />
                <button
                  type="submit"
                  aria-label="Delete note"
                  className="niki-press niki-focus rounded-lg p-1.5 text-niki-ink/30 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
