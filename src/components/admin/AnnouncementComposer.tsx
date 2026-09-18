"use client";

import { useActionState } from "react";
import { Megaphone } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  saveAnnouncement,
  type AnnouncementState,
  type Scope,
} from "@/lib/announcement-actions";
import { audienceOptions, TONE_OPTIONS } from "@/lib/announcement-rules";

/**
 * Writing a notice.
 *
 * Four decisions, in the order somebody makes them: what it says, who it is
 * for, how loud it is, and when it matters. The window is the part worth
 * having — an admin writing on Sunday about a change that starts on Monday
 * used to have to remember to come back and publish it.
 *
 * Both consoles use this; `scope` decides which table it writes to and which
 * audiences it offers, and the server checks that pairing again.
 */

export interface AnnouncementDraft {
  id: string;
  title: string;
  body: string;
  tone: string;
  audience: string;
  isPinned: boolean;
  isActive: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
}

/** `datetime-local` wants the browser's own wall clock, not an ISO instant. */
function localValue(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AnnouncementComposer({
  scope,
  initial,
}: {
  scope: Scope;
  initial?: AnnouncementDraft;
}) {
  const [state, formAction] = useActionState<AnnouncementState, FormData>(saveAnnouncement, {});
  const audiences = audienceOptions(scope);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">
            {initial ? "Edit announcement" : "New announcement"}
          </h2>
          <p className="text-xs text-niki-ink/55">
            {initial ? "Changes show the moment you save." : "Goes out to everyone you choose."}
          </p>
        </div>
      </div>

      <input type="hidden" name="scope" value={scope} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title}
          placeholder="MTN prices have changed"
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
          rows={7}
          maxLength={4000}
          defaultValue={initial?.body}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who it's for" htmlFor="audience">
          <select
            id="audience"
            name="audience"
            defaultValue={initial?.audience ?? audiences[0].value}
            className={inputClass}
          >
            {audiences.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tone" htmlFor="tone">
          <select
            id="tone"
            name="tone"
            defaultValue={initial?.tone ?? "info"}
            className={inputClass}
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts showing" htmlFor="publishAt" hint="Leave blank to start now.">
          <input
            id="publishAt"
            name="publishAt"
            type="datetime-local"
            defaultValue={localValue(initial?.publishAt)}
            className={inputClass}
          />
        </Field>
        <Field label="Stops showing" htmlFor="expiresAt" hint="Leave blank to run until hidden.">
          <input
            id="expiresAt"
            name="expiresAt"
            type="datetime-local"
            defaultValue={localValue(initial?.expiresAt)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl bg-niki-surface px-4 py-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-niki-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial ? initial.isActive : true}
            className="h-4 w-4 accent-niki-orange"
          />
          Published
          <span className="text-xs font-normal text-niki-ink/50">
            — unticking hides it from everyone, whatever the dates say
          </span>
        </label>
        <label className="flex items-center gap-2.5 text-sm font-medium text-niki-ink">
          <input
            type="checkbox"
            name="isPinned"
            defaultChecked={initial?.isPinned ?? false}
            className="h-4 w-4 accent-niki-orange"
          />
          Pin to the top
        </label>
      </div>

      <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />

      <SubmitButton
        pendingLabel="Saving…"
        className="w-full rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        {initial ? "Save changes" : "Publish announcement"}
      </SubmitButton>
    </form>
  );
}
