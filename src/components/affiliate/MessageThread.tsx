"use client";

import { useActionState } from "react";
import { BadgeCheck, CheckCheck, EyeOff, Lock, Send, Share2 } from "lucide-react";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  postAssistMessage,
  relaySupportAnswer,
  resolveAssistThread,
  type AssistState,
} from "@/lib/affiliate-assist-actions";
import { cn } from "@/lib/cn";

/**
 * One conversation, from whichever side is reading it.
 *
 * The same component serves the affiliate, the buyer and Nickimart's support
 * desk, because they are doing the same thing — reading what was said and
 * saying something back — and three near-identical conversation views would
 * drift apart within a month. What differs is handed in: who "I" am, what the
 * box says when it is empty, and whether a private note is on offer.
 *
 * Two details carry real weight. A message passed on from Nickimart is marked
 * as verified, which is the whole point of relaying one: a buyer can tell the
 * difference between what the platform confirmed and what their helper thinks.
 * And a private note is drawn as a note — set apart, labelled, obviously not
 * part of what the other side can see — because a working note that looks like
 * a sent message is one somebody will believe was sent.
 */

export interface ThreadMessage {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  internal: boolean;
  verified: boolean;
  createdAt: string;
  mine: boolean;
}

const ROLE_TINT: Record<string, string> = {
  affiliate: "bg-niki-orange/10 text-niki-orange",
  customer: "bg-niki-trust/10 text-niki-trust",
  support: "bg-niki-success/10 text-niki-success",
};

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageThread({
  threadId,
  kind,
  messages,
  role,
  placeholder,
  allowInternal = false,
  allowRelay = false,
  allowResolve = true,
  resolved = false,
  resolution = "",
  disabled = false,
  disabledNote = "",
}: {
  threadId: string;
  kind: string;
  messages: ThreadMessage[];
  role: "affiliate" | "customer" | "support";
  placeholder?: string;
  /** A note the other side never sees. Not offered to a customer. */
  allowInternal?: boolean;
  /** Offer "pass this on" against each of Nickimart's answers. */
  allowRelay?: boolean;
  allowResolve?: boolean;
  resolved?: boolean;
  resolution?: string;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [state, send] = useActionState<AssistState, FormData>(postAssistMessage, {});
  const [relayState, relay] = useActionState<AssistState, FormData>(relaySupportAnswer, {});

  return (
    <div className="rounded-2xl bg-white ring-1 ring-niki-edge">
      <ol className="max-h-[32rem] space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <li className="py-10 text-center text-sm text-niki-ink/45">
            Nothing said yet. Your first message starts the conversation.
          </li>
        ) : null}

        {messages.map((m) => (
          <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] sm:max-w-[75%]", m.mine && "text-right")}>
              <div
                className={cn(
                  "inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed ring-1",
                  m.internal
                    ? "border border-dashed border-niki-gold/60 bg-niki-gold/10 text-amber-900 ring-transparent"
                    : m.mine
                      ? "bg-niki-orange/10 text-niki-ink ring-niki-orange/20"
                      : "bg-niki-surface text-niki-ink ring-niki-edge",
                )}
              >
                {m.internal ? (
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    <EyeOff className="h-3 w-3" />
                    Private note — only you see this
                  </p>
                ) : null}

                {m.verified ? (
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-niki-success">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Confirmed by Nickimart
                  </p>
                ) : null}

                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-niki-ink/45">
                {!m.mine ? (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-semibold",
                      ROLE_TINT[m.authorRole] ?? "bg-niki-ink/10 text-niki-ink/60",
                    )}
                  >
                    {m.authorName || m.authorRole}
                  </span>
                ) : null}
                {when(m.createdAt)}

                {allowRelay && m.authorRole === "support" && !m.internal ? (
                  <form action={relay} className="inline">
                    <input type="hidden" name="threadId" value={threadId} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <button
                      type="submit"
                      className="niki-press inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-niki-orange hover:bg-niki-orange/10"
                      title="Send this answer to your customer, marked as confirmed by Nickimart"
                    >
                      <Share2 className="h-3 w-3" />
                      Pass this on
                    </button>
                  </form>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {relayState.error ? <FormFeedback error={relayState.error} className="mx-5 mb-4" /> : null}
      {relayState.ok ? (
        <FormFeedback success="Passed on to your customer." className="mx-5 mb-4" />
      ) : null}

      {resolved ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-niki-edge px-5 py-4 text-sm text-niki-ink/60">
          <CheckCheck className="h-4 w-4 text-niki-success" />
          <span className="font-semibold text-niki-ink">Resolved.</span>
          {resolution ? <span>{resolution}</span> : null}
          <span className="text-niki-ink/45">Writing again reopens it.</span>
        </div>
      ) : null}

      <div className="border-t border-niki-edge p-5">
        {disabled ? (
          <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">
            {disabledNote || "You can't write in this conversation."}
          </p>
        ) : (
          <form action={send} className="space-y-3">
            <input type="hidden" name="threadId" value={threadId} />
            <label className="sr-only" htmlFor={`body-${threadId}`}>
              Your message
            </label>
            <textarea
              id={`body-${threadId}`}
              name="body"
              rows={3}
              required
              maxLength={4000}
              placeholder={
                placeholder ??
                (kind === "support"
                  ? "What do you need to know? Be specific — the order, the product, the question."
                  : "Write to your customer…")
              }
              className="w-full resize-y rounded-xl border border-niki-edge-strong bg-white px-4 py-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
            />

            <FormFeedback error={state.error} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              {allowInternal && role !== "customer" ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-niki-ink/60">
                  <input
                    type="checkbox"
                    name="internal"
                    className="h-4 w-4 rounded border-niki-edge-control text-niki-orange focus:ring-niki-orange"
                  />
                  <Lock className="h-3.5 w-3.5" />
                  Keep this a private note
                </label>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                {allowResolve && !resolved ? (
                  <button
                    type="submit"
                    form={`resolve-${threadId}`}
                    className="niki-press rounded-xl px-3.5 py-2.5 text-sm font-semibold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
                  >
                    Mark resolved
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="niki-press inline-flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </div>
          </form>
        )}

        {allowResolve && !resolved ? (
          <form id={`resolve-${threadId}`} action={resolveAssistThread} className="hidden">
            <input type="hidden" name="threadId" value={threadId} />
          </form>
        ) : null}
      </div>
    </div>
  );
}
