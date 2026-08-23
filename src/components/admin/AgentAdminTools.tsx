"use client";

import { useActionState } from "react";
import { Megaphone, Scale, Send } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import {
  adjustAgentBalance,
  saveAnnouncement,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";

function Result({ state }: { state: AgentAdminState }) {
  if (state.error) {
    return (
      <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Correct an agent's balance by hand. Deliberately blunt — an amount and a
 * reason — because every use of it is an exception that someone will need to
 * understand from the ledger months later.
 */
export function BalanceAdjuster({ agentId }: { agentId: string }) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(adjustAgentBalance, {});

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display font-bold text-niki-ink">Adjust balance</h2>
      </div>

      <Result state={state} />
      <input type="hidden" name="agentId" value={agentId} />

      <Field
        label="Amount (GH₵)"
        htmlFor="amount"
        hint="Positive credits the agent, negative debits them."
      >
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          required
          placeholder="-30.00"
          className={inputClass}
        />
      </Field>

      <Field label="Reason" htmlFor="narration" hint="Shown to the agent on their wallet.">
        <input
          id="narration"
          name="narration"
          required
          placeholder="Goodwill credit for order ND-…"
          className={inputClass}
        />
      </Field>

      <SubmitButton
        pendingLabel="Posting…"
        className="w-full rounded-xl bg-niki-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-navy-soft"
      >
        Post adjustment
      </SubmitButton>
    </form>
  );
}

/** Publish an announcement to every agent's Notifications screen. */
export function AnnouncementForm({
  initial,
}: {
  initial?: { id: string; title: string; body: string; tone: string; isPinned: boolean };
}) {
  const [state, formAction] = useActionState<AgentAdminState, FormData>(saveAnnouncement, {});

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display font-bold text-niki-ink">
          {initial ? "Edit announcement" : "New announcement"}
        </h2>
      </div>

      <Result state={state} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          defaultValue={initial?.title}
          placeholder="MTN UPDATE"
          className={inputClass}
        />
      </Field>

      <Field
        label="Message"
        htmlFor="body"
        hint="Plain text. Leave a blank line between paragraphs."
      >
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          defaultValue={initial?.body}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone" htmlFor="tone">
          <select id="tone" name="tone" defaultValue={initial?.tone ?? "info"} className={inputClass}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="success">Good news</option>
          </select>
        </Field>

        <label className="flex items-end gap-2 pb-2.5 text-sm text-niki-ink/70">
          <input
            type="checkbox"
            name="isPinned"
            defaultChecked={initial?.isPinned}
            className="h-4 w-4 rounded"
          />
          Pin above other notices
        </label>
      </div>

      <SubmitButton
        pendingLabel="Publishing…"
        icon={<Send className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
      >
        {initial ? "Save announcement" : "Publish to all agents"}
      </SubmitButton>
    </form>
  );
}
