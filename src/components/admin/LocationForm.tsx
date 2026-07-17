"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

const TYPES = ["city", "town", "campus", "institution", "community"];

export function LocationForm({
  action,
  location,
  submitLabel,
}: {
  action: Action;
  location?: { name: string; type: string; region: string; isActive: boolean; order: number; deliveryZoneMultiplier?: number };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const l = location;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" defaultValue={l?.name} required className={inputClass} />
        </Field>
        <Field label="Region" htmlFor="region">
          <input id="region" name="region" defaultValue={l?.region} required className={inputClass} />
        </Field>
        <Field label="Type" htmlFor="type">
          <select id="type" name="type" defaultValue={l?.type ?? "city"} className={inputClass}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order" htmlFor="order" hint="Lower numbers show first">
          <input id="order" name="order" type="number" defaultValue={l?.order ?? 0} className={inputClass} />
        </Field>
        <Field label="Delivery zone ×" htmlFor="deliveryZoneMultiplier" hint="1 = standard · <1 nearer/cheaper · >1 farther">
          <input id="deliveryZoneMultiplier" name="deliveryZoneMultiplier" type="number" step="0.05" min="0.1" defaultValue={l?.deliveryZoneMultiplier ?? 1} className={inputClass} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={l?.isActive ?? true} className="h-4 w-4 rounded" />
        Active (shown in the location picker)
      </label>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/locations" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
