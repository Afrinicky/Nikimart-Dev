"use client";

import { useActionState, useState } from "react";
import { MessageSquarePlus, Send } from "lucide-react";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { THREAD_TOPICS } from "@/lib/affiliate-assist-rules";
import { openCustomerThread, type AssistState } from "@/lib/affiliate-assist-actions";
import { inputClass } from "@/components/ui/Field";

/**
 * Writing to a customer for the first time.
 *
 * Folded away until it is wanted, because on an order screen the question is
 * usually "where is it" and only sometimes "let me write to them". Once a
 * conversation exists the screen shows the conversation instead and this is
 * out of the way for good.
 */
export function ContactCustomerForm({
  customerId,
  orderId = null,
  customerName,
  orderNumber = null,
  label,
  defaultTopic = "general",
  suspended = false,
}: {
  customerId: string;
  orderId?: string | null;
  customerName: string;
  orderNumber?: string | null;
  label?: string;
  defaultTopic?: string;
  suspended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AssistState, FormData>(openCustomerThread, {});

  if (suspended) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">
        Your affiliate account is on hold, so you can&apos;t start new conversations. Commission you
        have already earned is unaffected.
      </p>
    );
  }

  if (!open && !state.ok) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press inline-flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
      >
        <MessageSquarePlus className="h-4 w-4" />
        {label ?? `Message ${customerName}`}
      </button>
    );
  }

  if (state.ok) {
    return (
      <FormFeedback success={`Sent. ${customerName} has been told there's a message waiting.`} />
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
      <input type="hidden" name="customerId" value={customerId} />
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-niki-ink">
          To {customerName}
          {orderNumber ? <span className="text-niki-ink/50"> · {orderNumber}</span> : null}
        </p>
        <select name="topic" defaultValue={defaultTopic} className={`${inputClass} h-10 w-auto py-1.5`}>
          {THREAD_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder={
          orderNumber
            ? `Hello ${customerName}, I'm your Nickimart helper for ${orderNumber}. Any questions, ask me here.`
            : `Hello ${customerName} — anything you'd like help finding?`
        }
        className="w-full resize-y rounded-xl border border-niki-edge-strong bg-white px-4 py-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
      />

      <FormFeedback error={state.error} />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-press rounded-xl px-3.5 py-2.5 text-sm font-semibold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="niki-press inline-flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </form>
  );
}
