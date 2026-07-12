"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { COLLECTIONS, VENDOR_FILTERS, SECTION_ICONS, blockDef, type SectionConfig } from "@/lib/page-blocks";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function SectionForm({
  action,
  type,
  config,
  pageId,
}: {
  action: Action;
  type: string;
  config: SectionConfig;
  pageId: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const def = blockDef(type);

  if (!def || def.fields.length === 0) {
    return (
      <div className="rounded-xl bg-niki-surface p-4 text-sm text-niki-ink/60 ring-1 ring-black/5">
        This block has no editable settings. Use the controls on the page to move, hide, or remove it.
        <div className="mt-4">
          <Link href={`/admin/pages/${pageId}`} className="text-sm font-semibold text-niki-orange hover:underline">
            ← Back to page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      {def.fields.map((field) => {
        const value = config[field.name];
        if (field.type === "bool") {
          return (
            <label key={field.name} className="flex items-center gap-2 text-sm text-niki-ink/80">
              <input type="checkbox" name={field.name} defaultChecked={Boolean(value)} className="h-4 w-4 rounded" />
              {field.label}
            </label>
          );
        }
        if (field.type === "textarea") {
          return (
            <Field key={field.name} label={field.label} htmlFor={field.name} hint={field.hint}>
              <textarea id={field.name} name={field.name} defaultValue={String(value ?? "")} rows={3} className={inputClass} />
            </Field>
          );
        }
        if (field.type === "collection" || field.type === "vendorFilter" || field.type === "tone" || field.type === "icon") {
          const options =
            field.type === "collection"
              ? COLLECTIONS.map((c) => ({ value: c.value, label: c.label }))
              : field.type === "vendorFilter"
                ? VENDOR_FILTERS.map((v) => ({ value: v.value, label: v.label }))
                : field.type === "tone"
                  ? [
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]
                  : [{ value: "", label: "— none —" }, ...SECTION_ICONS.map((i) => ({ value: i, label: i }))];
          return (
            <Field key={field.name} label={field.label} htmlFor={field.name} hint={field.hint}>
              <select id={field.name} name={field.name} defaultValue={String(value ?? "")} className={inputClass}>
                {field.type !== "icon" ? <option value="">— default —</option> : null}
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }
        return (
          <Field key={field.name} label={field.label} htmlFor={field.name} hint={field.hint}>
            <input id={field.name} name={field.name} defaultValue={String(value ?? "")} className={inputClass} />
          </Field>
        );
      })}

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>Save section</SubmitButton>
        </div>
        <Link href={`/admin/pages/${pageId}`} className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
