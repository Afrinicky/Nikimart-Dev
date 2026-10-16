"use client";

import { useActionState, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { THREAD_TOPICS } from "@/lib/affiliate-assist-rules";
import { escalateThread, type AssistState } from "@/lib/affiliate-assist-actions";
import { inputClass } from "@/components/ui/Field";

/**
 * Asking Nickimart something an affiliate cannot answer.
 *
 * This exists so that a buyer is never told a guess. An affiliate does not
 * know whether a shop has a thing in stock or why a parcel has sat still for a
 * week, and the natural failure of this whole feature would be confident
 * invention. The enquiry goes to Nickimart's queue, the answer comes back, and
 * the answer is what gets passed on — with Nickimart's name on it.
 */
export function EscalateForm({
  threadId = null,
  orderId = null,
  orderNumber = null,
  defaultSubject = "",
  defaultTopic = "availability",
}: {
  threadId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  defaultSubject?: string;
  defaultTopic?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AssistState, FormData>(escalateThread, {});

  if (state.ok) {
    return (
      <FormFeedback success="Raised with Nickimart. You'll be told the moment there's an answer." />
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
      >
        <LifeBuoy className="h-4 w-4 text-niki-orange" />
        Ask Nickimart
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
      {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}

      <p className="text-sm font-semibold text-niki-ink">
        Ask Nickimart
        {orderNumber ? <span className="text-niki-ink/50"> · {orderNumber}</span> : null}
      </p>
      <p className="text-xs text-niki-ink/55">
        Support answers here, and you can pass the answer straight to your customer marked as
        confirmed by Nickimart.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <input
          name="subject"
          defaultValue={defaultSubject}
          maxLength={140}
          placeholder="What is this about?"
          className={inputClass}
        />
        <select name="topic" defaultValue={defaultTopic} className={inputClass}>
          {THREAD_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="normal" className={inputClass}>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <textarea
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Be specific: the order, the product, and exactly what you need to tell your customer."
        className="w-full resize-y rounded-xl border border-niki-edge-strong bg-white px-4 py-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
      />

      <FormFeedback error={state.error} />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-press rounded-xl px-3.5 py-2.5 text-sm font-semibold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="niki-press rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          Send to support
        </button>
      </div>
    </form>
  );
}
