"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Send, Users } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  previewBroadcast,
  sendBroadcastNow,
  type BroadcastState,
} from "@/lib/message-actions";
import { renderMessage, smsSegments } from "@/lib/message-templates";
import type { MessageScope } from "@/lib/message-templates";
import { cn } from "@/lib/cn";

/**
 * Writing something and sending it to a few thousand people.
 *
 * Built around the one fact that separates this from every other form in the
 * console: it cannot be undone. So the count is fetched and shown before the
 * button is live, the cost is stated in SMS parts rather than characters, and
 * the number on screen is submitted with the form — if the audience has moved
 * since it was counted, the send is refused and the person is asked again
 * rather than surprised.
 */

export interface BroadcastAudience {
  value: string;
  label: string;
  note: string;
}

interface Estimate {
  people: number;
  withPhone: number;
  withEmail: number;
  segments: number;
  totalSegments: number;
  unicode: boolean;
}

export function BroadcastComposer({
  scope,
  audiences,
}: {
  scope: MessageScope;
  audiences: BroadcastAudience[];
}) {
  const [state, formAction] = useActionState<BroadcastState, FormData>(sendBroadcastNow, {});
  const [audience, setAudience] = useState(audiences[0]?.value ?? "");
  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [counting, startCounting] = useTransition();

  // Recount whenever the audience changes, and when the body settles — the
  // cost depends on both, and a number that lags behind the form is worse
  // than no number.
  useEffect(() => {
    if (!audience) return;
    const t = setTimeout(() => {
      startCounting(async () => {
        try {
          setEstimate(await previewBroadcast(scope, audience, body));
        } catch {
          setEstimate(null);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [scope, audience, body]);

  const chosen = audiences.find((a) => a.value === audience);
  // An empty box already reads as one part — smsSegments floors it — so pass
  // the body as typed rather than a space, which counted a character nobody
  // had written.
  const parts = smsSegments(body);
  const ready = Boolean(estimate && estimate.people > 0 && body.trim().length >= 5);

  if (state.ok) {
    // A broadcast that reached nobody is not a success, and a green tick over
    // "0 of 6 reached" is exactly the kind of thing an admin scrolls past. The
    // three outcomes are told apart on the face of the panel, not only in the
    // sentence under it.
    const none = state.delivered === 0 && state.recipients > 0;
    const partial = !none && state.failed > 0;
    return (
      <div className="animate-scale-in rounded-2xl bg-white p-6 text-center ring-1 ring-niki-edge">
        <span
          className={cn(
            "mx-auto flex h-12 w-12 items-center justify-center rounded-2xl",
            none
              ? "bg-niki-danger/10 text-niki-danger"
              : partial
                ? "bg-amber-100 text-amber-700"
                : "bg-niki-success/10 text-niki-success",
          )}
        >
          {none ? <AlertTriangle className="h-6 w-6" /> : <Check className="h-6 w-6" />}
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          {none ? "Nobody was reached" : partial ? "Partly sent" : "Sent"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/65">{state.message}</p>
        {none ? (
          <p className="mx-auto mt-2 max-w-sm text-xs text-niki-ink/50">
            The gateway accepted none of them. Check the SMS and email keys under Settings before
            sending it again.
          </p>
        ) : null}
        <a
          href={scope === "retail" ? "/admin/broadcasts" : "/admin/data/broadcasts"}
          className="niki-press mt-5 inline-flex rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Back to broadcasts
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="confirmedCount" value={estimate?.people ?? ""} />

      <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <Field label="Who it goes to" htmlFor="audience" hint={chosen?.note}>
          <select
            id="audience"
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass}
          >
            {audiences.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How to send it" htmlFor="channel">
          <select
            id="channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "sms" | "email" | "both")}
            className={inputClass}
          >
            <option value="sms">Text message</option>
            <option value="email">Email</option>
            <option value="both">Both</option>
          </select>
        </Field>

        {channel !== "sms" ? (
          <Field label="Email subject" htmlFor="subject">
            <input
              id="subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              className={inputClass}
            />
          </Field>
        ) : (
          <input type="hidden" name="subject" value="" />
        )}

        <Field
          label="Message"
          htmlFor="body"
          hint={`${parts.length} characters · ${parts.segments} SMS ${parts.segments === 1 ? "part" : "parts"} each. Use {{name}} to greet each person by name.`}
        >
          <textarea
            id="body"
            name="body"
            rows={6}
            required
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {{name}}, MTN prices have changed — check your storefront before you next advertise."
            className={`${inputClass} resize-y`}
          />
        </Field>

        <FormFeedback error={state.error} />

        <SubmitButton
          pendingLabel="Sending…"
          disabled={!ready}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {estimate && estimate.people > 0
            ? `Send to ${estimate.people} ${estimate.people === 1 ? "person" : "people"}`
            : "Send"}
        </SubmitButton>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-niki-ink/45">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This goes out immediately and cannot be recalled. Read it once more before you press it.
        </p>
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-niki-orange" />
            <h3 className="font-display font-bold text-niki-ink">Who this reaches</h3>
          </div>
          {counting ? (
            <p className="text-sm text-niki-ink/50">Counting…</p>
          ) : estimate ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="People" value={String(estimate.people)} />
              <Row label="With a phone number" value={String(estimate.withPhone)} />
              <Row label="With an email" value={String(estimate.withEmail)} />
              {channel !== "email" ? (
                <Row
                  label="SMS parts billed"
                  value={String(estimate.totalSegments)}
                  note={estimate.unicode ? "A symbol like ₵ triples this" : undefined}
                />
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-niki-ink/50">Pick a group to see the count.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h3 className="mb-3 font-display font-bold text-niki-ink">As it arrives</h3>
          <div
            className={cn(
              "rounded-2xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/80",
              !body && "text-niki-ink/35",
            )}
          >
            {renderMessage(body, { name: "Ama" }) || "Your message will appear here."}
          </div>
        </section>
      </div>
    </form>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-niki-edge py-1.5 last:border-0">
      <dt className="text-niki-ink/55">
        {label}
        {note ? <span className="block text-[11px] text-niki-ink/40">{note}</span> : null}
      </dt>
      <dd className="font-figures font-bold text-niki-ink">{value}</dd>
    </div>
  );
}
