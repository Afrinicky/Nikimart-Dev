"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function FaqForm({
  action,
  faq,
  submitLabel,
}: {
  action: Action;
  faq?: { question: string; answer: string; order: number };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <Field label="Question" htmlFor="question">
        <input id="question" name="question" defaultValue={faq?.question} required className={inputClass} />
      </Field>
      <Field label="Answer" htmlFor="answer">
        <textarea id="answer" name="answer" defaultValue={faq?.answer} required rows={4} className={inputClass} />
      </Field>
      <Field label="Order" htmlFor="order" hint="Lower numbers show first">
        <input id="order" name="order" type="number" defaultValue={faq?.order ?? 0} className={inputClass} />
      </Field>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/faqs" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
