"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

/**
 * A Ghana arrival point: where a consignment from abroad clears and the
 * domestic leg begins.
 *
 * The two numbers here decide a lot of a buyer's bill. `dutyPercent` is charged
 * on the landed value, and `hubPickupId` is where leg 3 starts from — pointing
 * a Tema clearance at an Accra hub would quietly bill every buyer for a journey
 * their goods never make. Both are admin-only for that reason.
 */
export function ArrivalPointForm({
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
    dutyPercent: number;
    clearingFee: number;
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
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint="What sellers and buyers will see.">
          <input id="name" name="name" defaultValue={p?.name} required placeholder="Tema Port" className={inputClass} />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short, unique. e.g. TEMA-SEA"}>
          <input id="code" name="code" defaultValue={p?.code} required placeholder="TEMA-SEA" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <input id="city" name="city" defaultValue={p?.city} placeholder="Tema" className={inputClass} />
        </Field>
        <Field label="Address" htmlFor="address">
          <input id="address" name="address" defaultValue={p?.address} className={inputClass} />
        </Field>
      </div>

      <Field
        label="Domestic leg starts from"
        htmlFor="hubPickupId"
        hint="The pickup point goods travel out from once they've cleared here. Leave unset to use the site-wide arrival hub."
      >
        <select id="hubPickupId" name="hubPickupId" defaultValue={p?.hubPickupId ?? ""} className={inputClass}>
          <option value="">Site-wide arrival hub</option>
          {pickupPoints.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name} — {pt.locationName}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Import duty (%)"
          htmlFor="dutyPercent"
          hint="Charged on the landed value — goods plus freight. Leave at 0 to use the platform default."
        >
          <input
            id="dutyPercent"
            name="dutyPercent"
            type="number"
            min="0"
            max="100"
            step="0.1"
            defaultValue={p?.dutyPercent ?? 0}
            className={inputClass}
          />
        </Field>
        <Field
          label="Clearing & handling (GH₵)"
          htmlFor="clearingFee"
          hint="A flat charge per order line clearing through this point."
        >
          <input
            id="clearingFee"
            name="clearingFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={p?.clearingFee ?? 0}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Note" htmlFor="note" hint="Shown to sellers choosing this point. Optional.">
        <textarea id="note" name="note" rows={2} defaultValue={p?.note} className={inputClass} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="h-4 w-4 rounded" />
        Active — sellers can choose this point
      </label>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/arrival-points" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
