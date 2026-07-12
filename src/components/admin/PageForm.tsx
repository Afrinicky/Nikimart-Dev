"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { createPage } from "@/lib/page-actions";
import type { CrudState } from "@/lib/admin-actions";

export function PageForm() {
  const [state, formAction] = useActionState<CrudState, FormData>(createPage, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}
      <Field label="Page title" htmlFor="title" hint={state.fieldErrors?.title}>
        <input id="title" name="title" required className={inputClass} placeholder="e.g. About Us" />
      </Field>
      <Field label="Slug (optional)" htmlFor="slug" hint={state.fieldErrors?.slug ?? "URL will be /pages/<slug>. Auto from title if blank."}>
        <input id="slug" name="slug" className={inputClass} placeholder="about" />
      </Field>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>Create page</SubmitButton>
        </div>
        <Link href="/admin/pages" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
