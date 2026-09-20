"use client";

import { useActionState, useState } from "react";
import { Plus, Users } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { createGroupRoom, type ChatState } from "@/lib/chat/actions";
import { cn } from "@/lib/cn";

/**
 * A room for a set of people.
 *
 * Everybody, or a chosen few. The "everybody" case is the one that gets used —
 * one announcement room for the whole network — so it is a single click rather
 * than three hundred checkboxes.
 */
export function GroupRoomForm({
  agents,
}: {
  agents: { id: string; code: string; storeName: string }[];
}) {
  const [state, formAction] = useActionState<ChatState, FormData>(createGroupRoom, {});
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<"all-agents" | "chosen">("all-agents");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
      >
        <Plus className="h-4 w-4" />
        New room
      </button>
    );
  }

  return (
    <form action={formAction} className="animate-fade-up space-y-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Users className="h-4 w-4" />
        </span>
        <h2 className="font-display font-bold text-niki-ink">New room</h2>
      </div>

      <input
        name="title"
        required
        maxLength={80}
        placeholder="Room name — e.g. All data agents"
        className={inputClass}
      />

      <div className="flex flex-wrap gap-2">
        {(["all-agents", "chosen"] as const).map((value) => (
          <label
            key={value}
            className={cn(
              "niki-focus cursor-pointer rounded-xl px-4 py-2 text-xs font-bold transition-colors",
              audience === value
                ? "bg-niki-black text-white"
                : "bg-niki-surface text-niki-ink/60 hover:text-niki-ink",
            )}
          >
            <input
              type="radio"
              name="audience"
              value={value}
              checked={audience === value}
              onChange={() => setAudience(value)}
              className="sr-only"
            />
            {value === "all-agents" ? `Every active agent (${agents.length})` : "Choose people"}
          </label>
        ))}
      </div>

      {audience === "chosen" ? (
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl bg-niki-surface p-2">
          {agents.map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white"
            >
              <input
                type="checkbox"
                name="agentIds"
                value={a.id}
                className="h-4 w-4 accent-niki-orange"
              />
              <span className="min-w-0 flex-1 truncate font-medium text-niki-ink">
                {a.storeName}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-niki-ink/40">{a.code}</span>
            </label>
          ))}
        </div>
      ) : null}

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
          pendingLabel="Creating…"
          className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Create room
        </SubmitButton>
      </div>
    </form>
  );
}
