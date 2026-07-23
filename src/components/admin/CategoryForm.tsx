"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";
import type { Category } from "@/lib/types";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function CategoryForm({
  action,
  category,
  submitLabel,
}: {
  action: Action;
  category?: Category;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const c = category;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint={state.fieldErrors?.name}>
          <input id="name" name="name" defaultValue={c?.name} required className={inputClass} />
        </Field>
        <Field label="Slug (optional)" htmlFor="slug" hint={state.fieldErrors?.slug ?? "Auto-generated if blank"}>
          <input id="slug" name="slug" defaultValue={c?.slug} className={inputClass} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" hint={state.fieldErrors?.description}>
        <textarea id="description" name="description" defaultValue={c?.description} required rows={2} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Icon (lucide name)" htmlFor="icon" hint="e.g. smartphone, shirt, utensils">
          <input id="icon" name="icon" defaultValue={c?.icon ?? "shopping-bag"} className={inputClass} />
        </Field>
        <Field label="Product count (display)" htmlFor="productCount">
          <input id="productCount" name="productCount" type="number" min="0" defaultValue={c?.productCount ?? 0} className={inputClass} />
        </Field>
      </div>

      <Field label="Commission override (%)" htmlFor="commissionRate" hint="Leave blank to use the platform default commission for this category.">
        <input id="commissionRate" name="commissionRate" type="number" min="0" max="100" step="0.1" defaultValue={c?.commissionRate ?? ""} className={inputClass} />
      </Field>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/categories" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
