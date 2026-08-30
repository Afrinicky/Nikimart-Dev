"use client";

import { useActionState, useState } from "react";
import { Check, ChevronDown, ExternalLink, RotateCcw, Save } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { savePolicy, resetPolicy, type PolicyState } from "@/lib/legal-actions";
import { cn } from "@/lib/cn";

/**
 * One policy, edited as text.
 *
 * Collapsed by default — seven open textareas is a wall, and an admin comes
 * here to change one document. `## ` starts a section, which keeps the editing
 * experience closer to writing than to filling in a form.
 */
export function PolicyEditor({
  slug,
  title,
  intro,
  body,
  standardBody,
  updatedAt,
}: {
  slug: string;
  title: string;
  intro: string;
  body: string;
  standardBody: string;
  updatedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(body);
  const [saveState, save] = useActionState<PolicyState, FormData>(savePolicy, {});
  const [resetState, reset] = useActionState<PolicyState, FormData>(resetPolicy, {});
  const state = saveState.error || saveState.ok ? saveState : resetState;

  const edited = Boolean(updatedAt);
  const sectionCount = (text.match(/^#{1,3}\s+/gm) ?? []).length;

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge-strong">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="niki-focus flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-niki-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-niki-ink">{title}</span>
          <span className="mt-0.5 block text-xs text-niki-ink/50">
            /legal/{slug} · {sectionCount} section{sectionCount === 1 ? "" : "s"} ·{" "}
            {edited
              ? `edited ${new Date(updatedAt!).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}`
              : "standard wording"}
          </span>
        </span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-niki-ink/40 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="animate-fade-up border-t border-niki-edge p-5">
          {state.error ? (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
            >
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success"
            >
              <Check className="h-4 w-4" />
              {state.message}
            </p>
          ) : null}

          <form action={save} className="space-y-4">
            <input type="hidden" name="slug" value={slug} />

            <Field label="Title" htmlFor={`title-${slug}`}>
              <input
                id={`title-${slug}`}
                name="title"
                defaultValue={title}
                required
                className={inputClass}
              />
            </Field>

            <Field
              label="Intro"
              htmlFor={`intro-${slug}`}
              hint="One line under the heading, before the sections."
            >
              <input id={`intro-${slug}`} name="intro" defaultValue={intro} className={inputClass} />
            </Field>

            <Field
              label="The policy"
              htmlFor={`body-${slug}`}
              hint="Start a section with ## followed by its heading. Leave a blank line between paragraphs."
            >
              <textarea
                id={`body-${slug}`}
                name="body"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={16}
                required
                className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton
                pendingLabel="Publishing…"
                icon={<Save className="h-4 w-4" />}
                className="rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
              >
                Save &amp; publish
              </SubmitButton>

              <button
                type="button"
                onClick={() => setText(standardBody)}
                className="niki-press niki-focus flex items-center gap-1.5 rounded-xl bg-niki-surface px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-black/5"
              >
                <RotateCcw className="h-4 w-4" />
                Load standard wording
              </button>

              <a
                href={`/legal/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="niki-press niki-focus ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
              >
                <ExternalLink className="h-4 w-4" />
                View page
              </a>
            </div>
          </form>

          {edited ? (
            <form action={reset} className="mt-4 border-t border-niki-edge pt-4">
              <input type="hidden" name="slug" value={slug} />
              <SubmitButton
                pendingLabel="Reverting…"
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-niki-danger ring-1 ring-niki-danger/30 hover:bg-niki-danger/5"
              >
                Discard edits and revert to the standard wording
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
