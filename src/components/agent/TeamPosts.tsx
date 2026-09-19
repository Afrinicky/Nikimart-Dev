"use client";

import { useActionState, useState } from "react";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatWhen } from "@/components/agent/AgentUi";
import {
  deleteTeamPost,
  postToTeam,
  type TeamActionState,
} from "@/lib/data-bundles/team/actions";
import type { TeamPost } from "@/lib/data-bundles/team/communication";
import { cn } from "@/lib/cn";

/**
 * What a leader says to their own team.
 *
 * The composer is folded away, because most visits to this screen are to read
 * the numbers rather than to write — and an open textarea at the top of a
 * dashboard is a thing people scroll past rather than a thing they use.
 */
export function TeamPosts({ posts }: { posts: TeamPost[] }) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(postToTeam, {});
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
            <Megaphone className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display font-bold text-niki-ink">Team announcements</h2>
            <p className="text-xs text-niki-ink/55">Your team sees these on their dashboard.</p>
          </div>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="niki-press niki-focus flex shrink-0 items-center gap-1.5 rounded-xl bg-niki-black px-4 py-2 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Write one
          </button>
        ) : null}
      </div>

      {open ? (
        <form action={formAction} className="animate-fade-up mt-4 space-y-3">
          <input
            name="title"
            required
            maxLength={80}
            placeholder="Title"
            className={inputClass}
          />
          <textarea
            name="body"
            required
            rows={4}
            maxLength={2000}
            placeholder="What do you want them to know?"
            className={cn(inputClass, "resize-y")}
          />
          <label className="flex items-center gap-2 text-sm text-niki-ink/70">
            <input type="checkbox" name="isPinned" className="h-4 w-4 accent-niki-orange" />
            Keep it at the top
          </label>
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
              pendingLabel="Posting…"
              className="rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white"
            >
              Post to my team
            </SubmitButton>
          </div>
        </form>
      ) : null}

      {posts.length === 0 ? (
        <p className="mt-4 rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
          You haven&apos;t said anything to your team yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-niki-edge">
          {posts.map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-niki-ink">
                  {p.isPinned ? (
                    <Pin className="h-3.5 w-3.5 shrink-0 text-niki-orange" />
                  ) : null}
                  {p.title}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-niki-ink/70">{p.body}</p>
                <p className="mt-1 text-[11px] text-niki-ink/40">{formatWhen(p.createdAt)}</p>
              </div>
              <form action={deleteTeamPost}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  aria-label="Delete"
                  className="niki-press niki-focus rounded-lg p-1.5 text-niki-ink/30 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
