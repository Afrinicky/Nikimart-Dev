"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";
import { FormFeedback } from "@/components/ui/FormFeedback";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

/**
 * One of NikiMart's own consolidation points: where goods that never left
 * Ghana are gathered and checked before a courier takes them onward.
 *
 * A forwarder's warehouse in Ghana is not one of these. It belongs to that
 * forwarder, is created on their registration page, and no other forwarder or
 * seller may use it — which is why there is no kind to choose here, and no duty
 * or clearing charge: nothing clears customs at one of our points.
 *
 * "Sits at this pickup station" is the field that moves real money. It is what
 * makes collection free, and pointing it at the wrong station would bill every
 * buyer for a journey their goods never make.
 */
export function ConsolidationPointForm({
  action,
  point,
  pickupPoints,
  submitLabel,
}: {
  action: Action;
  point?: {
    name: string;
    code: string;
    city: string;
    address: string;
    note: string;
    isActive: boolean;
    hubPickupId: string | null;
  };
  pickupPoints: { id: string; name: string; locationName: string }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const p = point;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint="What sellers and buyers will see.">
          <input id="name" name="name" defaultValue={p?.name} required className={inputClass} />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short and unique."}>
          <input id="code" name="code" defaultValue={p?.code} required className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <input id="city" name="city" defaultValue={p?.city} className={inputClass} />
        </Field>
        <Field label="Address" htmlFor="address">
          <input id="address" name="address" defaultValue={p?.address} className={inputClass} />
        </Field>
      </div>

      <Field
        label="Sits at this pickup station"
        htmlFor="hubPickupId"
        hint="Set this when the point is at, or shares a building with, a pickup station. A buyer collecting there pays nothing — the goods are already in the room."
      >
        <select id="hubPickupId" name="hubPickupId" defaultValue={p?.hubPickupId ?? ""} className={inputClass}>
          <option value="">Not at a pickup station</option>
          {pickupPoints.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name} — {pt.locationName}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Note" htmlFor="note" hint="Shown to sellers choosing this point. Optional.">
        <textarea id="note" name="note" rows={2} defaultValue={p?.note} className={inputClass} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="h-4 w-4 rounded" />
        Active — sellers can choose this point
      </label>

      <FormFeedback error={state.error} />
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/shipping/points" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
