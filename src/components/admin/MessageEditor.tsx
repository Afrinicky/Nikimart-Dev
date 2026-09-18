"use client";

import { useState } from "react";
import { useActionState } from "react";
import { MessageSquare, Mail, RotateCcw } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  resetMessageTemplate,
  saveMessageTemplate,
  type MessageActionState,
} from "@/lib/message-actions";
import {
  exampleVars,
  renderMessage,
  smsSegments,
  unknownPlaceholders,
  type MessageTemplate,
} from "@/lib/message-templates";
import { cn } from "@/lib/cn";

/**
 * Editing one automatic message.
 *
 * The preview is live and the placeholder check is live, because both failures
 * this screen exists to prevent are invisible until the message has already
 * gone out: a misspelt {{placeholder}} arrives with braces in it, and a cedi
 * sign quietly drops an SMS from 160 characters a part to 70 — tripling what
 * a send costs without changing anything you can see.
 */

export interface MessageEditorTemplate extends MessageTemplate {
  currentSms: string;
  currentSubject: string;
  currentBody: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  edited: boolean;
}

export function MessageEditor({ template }: { template: MessageEditorTemplate }) {
  const [state, formAction] = useActionState<MessageActionState, FormData>(
    saveMessageTemplate,
    {},
  );
  const [sms, setSms] = useState(template.currentSms);
  const [subject, setSubject] = useState(template.currentSubject);
  const [body, setBody] = useState(template.currentBody);

  const vars = exampleVars(template);
  const parts = smsSegments(sms);
  const unknown = [
    ...unknownPlaceholders(template, sms),
    ...unknownPlaceholders(template, subject),
    ...unknownPlaceholders(template, body),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <input type="hidden" name="key" value={template.key} />
        <input type="hidden" name="scope" value={template.scope} />

        <div>
          <h2 className="font-display font-bold text-niki-ink">{template.name}</h2>
          <p className="mt-0.5 text-xs text-niki-ink/55">{template.description}</p>
        </div>

        <Field
          label="Text message"
          htmlFor={`sms-${template.key}`}
          hint={`${parts.length} characters · ${parts.segments} SMS ${parts.segments === 1 ? "part" : "parts"} each${parts.unicode ? " (a symbol like ₵ cuts a part from 160 characters to 70)" : ""}`}
        >
          <textarea
            id={`sms-${template.key}`}
            name="sms"
            rows={3}
            required
            value={sms}
            onChange={(e) => setSms(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </Field>

        {template.hasEmail ? (
          <>
            <Field label="Email subject" htmlFor={`subject-${template.key}`}>
              <input
                id={`subject-${template.key}`}
                name="emailSubject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field
              label="Email"
              htmlFor={`body-${template.key}`}
              hint="Plain text. Leave a blank line between paragraphs."
            >
              <textarea
                id={`body-${template.key}`}
                name="emailBody"
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </>
        ) : (
          <p className="rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/60">
            This one is sent by text only — there is no email address to send it to.
          </p>
        )}

        <div className="space-y-2 rounded-xl bg-niki-surface px-4 py-3">
          <label className="flex items-center gap-2.5 text-sm font-medium text-niki-ink">
            <input
              type="checkbox"
              name="smsEnabled"
              defaultChecked={template.smsEnabled}
              className="h-4 w-4 accent-niki-orange"
            />
            Send the text message
          </label>
          {template.hasEmail ? (
            <label className="flex items-center gap-2.5 text-sm font-medium text-niki-ink">
              <input
                type="checkbox"
                name="emailEnabled"
                defaultChecked={template.emailEnabled}
                className="h-4 w-4 accent-niki-orange"
              />
              Send the email
            </label>
          ) : null}
        </div>

        {unknown.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            {`{{${unknown[0]}}} `}
            isn&apos;t one of this message&apos;s values, so it would go out with the braces still in
            it. Check the spelling against the list.
          </p>
        ) : null}

        <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />

        <div className="flex flex-wrap gap-2">
          <SubmitButton
            pendingLabel="Saving…"
            className="flex-1 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            Save
          </SubmitButton>
        </div>
      </form>

      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-niki-orange" />
            <h3 className="font-display font-bold text-niki-ink">As it arrives</h3>
          </div>
          <div
            className={cn(
              "rounded-2xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/80",
              !template.smsEnabled && "opacity-40",
            )}
          >
            {renderMessage(sms, vars) || "—"}
          </div>

          {template.hasEmail ? (
            <div className={cn("mt-3", !template.emailEnabled && "opacity-40")}>
              <div className="mb-1.5 flex items-center gap-2">
                <Mail className="h-4 w-4 text-niki-ink/40" />
                <p className="text-xs font-semibold text-niki-ink/60">
                  {renderMessage(subject, vars) || "No subject"}
                </p>
              </div>
              <div className="whitespace-pre-wrap rounded-2xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/80">
                {renderMessage(body, vars) || "—"}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h3 className="mb-2 font-display font-bold text-niki-ink">What you can use</h3>
          <ul className="space-y-2">
            {template.variables.map((v) => (
              <li key={v.name} className="text-xs">
                <code className="rounded bg-niki-surface px-1.5 py-0.5 font-mono text-[11px] text-niki-ink">
                  {`{{${v.name}}}`}
                </code>
                <p className="mt-0.5 text-niki-ink/55">{v.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-niki-ink/45">
            Anything else in double braces is left in the message as written, so a typo shows
            rather than silently blanking a word.
          </p>
        </section>

        {template.edited ? (
          <form action={resetMessageTemplate}>
            <input type="hidden" name="key" value={template.key} />
            <button
              type="submit"
              className="niki-press niki-focus flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Put back the original wording
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
