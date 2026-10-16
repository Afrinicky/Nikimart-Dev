"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Headphones, MessageCircle, Send } from "lucide-react";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { messageMyAffiliate, type AssistState } from "@/lib/affiliate-assist-actions";
import type { ThreadMessage } from "@/components/affiliate/MessageThread";
import { MessageThread } from "@/components/affiliate/MessageThread";

/**
 * The person who recommended this, on the buyer's own order page.
 *
 * Somebody who bought on a friend's recommendation asks that friend where
 * their parcel is — and until now that happened on WhatsApp, where Nickimart
 * could not see it, the helper had nothing true to tell them, and nothing that
 * was promised was written down anywhere. This puts the same conversation on
 * the order it is about.
 *
 * The buyer is never asked to understand what an affiliate is. They are told
 * somebody is looking after this order and given a box to write in.
 */
export function AffiliateHelperPanel({
  orderNumber,
  helperName,
  threadId,
  messages,
}: {
  orderNumber: string;
  helperName: string;
  threadId: string | null;
  messages: ThreadMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AssistState, FormData>(messageMyAffiliate, {});

  if (threadId) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
          <Headphones className="h-4.5 w-4.5 text-niki-orange" />
          {helperName} is helping with this order
        </h2>
        <p className="mt-1 mb-4 text-sm text-niki-ink/55">
          Ask them anything about it. Answers marked{" "}
          <span className="inline-flex items-center gap-1 font-semibold text-niki-success">
            <BadgeCheck className="h-3.5 w-3.5" />
            confirmed by Nickimart
          </span>{" "}
          come from us, not from them.
        </p>

        <MessageThread
          threadId={threadId}
          kind="customer"
          role="customer"
          messages={messages}
          allowResolve={false}
          placeholder={`Ask ${helperName} about ${orderNumber}…`}
        />
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
        <Headphones className="h-4.5 w-4.5 text-niki-orange" />
        {helperName} can help with this order
      </h2>
      <p className="mt-1 text-sm text-niki-ink/55">
        They recommended this to you and can follow it up for you — availability, delivery, a
        return, or finding something else.
      </p>

      {state.ok ? (
        <FormFeedback
          success={`Sent to ${helperName}. Their reply appears here, and we'll let you know.`}
          className="mt-4"
        />
      ) : open ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <label className="sr-only" htmlFor="helper-body">
            Your message
          </label>
          <textarea
            id="helper-body"
            name="body"
            rows={3}
            required
            maxLength={4000}
            placeholder={`Hello ${helperName}, about ${orderNumber}…`}
            className="w-full resize-y rounded-xl border border-niki-edge-strong bg-white px-4 py-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
          />
          <FormFeedback error={state.error} />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/60 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <MessageCircle className="h-4 w-4" />
          Message {helperName}
        </button>
      )}
    </section>
  );
}
