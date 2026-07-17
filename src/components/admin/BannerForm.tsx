"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { SingleImageField } from "@/components/admin/SingleImageField";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export interface BannerFormValue {
  title: string;
  subtitle: string;
  eventWindow: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
  accentFrom: string;
  accentTo: string;
  isActive: boolean;
  order: number;
}

export function BannerForm({
  action,
  banner,
  submitLabel,
}: {
  action: Action;
  banner?: BannerFormValue;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const b = banner;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <Field label="Title" htmlFor="title" hint={state.fieldErrors?.title ?? "The big headline, e.g. “Samsung Hour — GH₵100 off”"}>
        <input id="title" name="title" defaultValue={b?.title} required className={inputClass} />
      </Field>

      <Field label="Subtitle" htmlFor="subtitle" hint="Optional supporting line">
        <input id="subtitle" name="subtitle" defaultValue={b?.subtitle} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event / offer line" htmlFor="eventWindow" hint="e.g. TODAY | 12PM – 3PM">
          <input id="eventWindow" name="eventWindow" defaultValue={b?.eventWindow} className={inputClass} />
        </Field>
        <Field label="Display order" htmlFor="order" hint="Lower shows first">
          <input id="order" name="order" type="number" defaultValue={b?.order ?? 0} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Button label" htmlFor="ctaLabel">
          <input id="ctaLabel" name="ctaLabel" defaultValue={b?.ctaLabel ?? "Shop now"} className={inputClass} />
        </Field>
        <Field label="Button link" htmlFor="ctaHref" hint="e.g. /products?badge=flash_sale">
          <input id="ctaHref" name="ctaHref" defaultValue={b?.ctaHref ?? "/products"} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Background colour (start)" htmlFor="accentFrom">
          <input id="accentFrom" name="accentFrom" type="color" defaultValue={b?.accentFrom ?? "#ff7a1a"} className="h-11 w-full cursor-pointer rounded-xl ring-1 ring-black/10" />
        </Field>
        <Field label="Background colour (end)" htmlFor="accentTo">
          <input id="accentTo" name="accentTo" type="color" defaultValue={b?.accentTo ?? "#0e1f36"} className="h-11 w-full cursor-pointer rounded-xl ring-1 ring-black/10" />
        </Field>
      </div>

      <SingleImageField
        name="image"
        label="Banner image (optional)"
        initial={b?.image ?? ""}
        hint="Product/hero image shown on the right of the slide."
        previewClass="h-24 w-40"
      />

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} className="h-4 w-4 rounded" />
        Active (shown in the homepage carousel)
      </label>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/banners" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
