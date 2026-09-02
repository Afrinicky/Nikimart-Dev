"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { POINT_KINDS, POINT_KIND_LABELS, isPointKind, type PointKind } from "@/lib/shipping";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

/**
 * A consolidation point: where a load is gathered and checked.
 *
 * Two fields on this form move real money and are admin-only for that reason.
 * "Sits at this pickup station" is the one that makes collection free, and
 * pointing it at the wrong station would bill every buyer for a journey their
 * goods never make. `dutyPercent` is charged on the landed value of anything
 * clearing here. A seller who could set either could quote a landed cost the
 * platform then has to honour at a customs desk.
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
    kind: string;
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
  const [kind, setKind] = useState<PointKind>(
    isPointKind(p?.kind) ? p.kind : "local",
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <Field
        label="What gathers here"
        htmlFor="kind"
        hint="Local points only need a name and a station. International ones also clear customs, so they carry a duty and a clearing charge."
      >
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PointKind)}
          className={inputClass}
        >
          {POINT_KINDS.map((k) => (
            <option key={k} value={k}>
              {POINT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint="What sellers and buyers will see.">
          <input
            id="name"
            name="name"
            defaultValue={p?.name}
            required
            placeholder={kind === "local" ? "Kumasi Depot" : "Tema Port"}
            className={inputClass}
          />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short and unique. e.g. KSI-DEPOT"}>
          <input
            id="code"
            name="code"
            defaultValue={p?.code}
            required
            placeholder={kind === "local" ? "KSI-DEPOT" : "TEMA-SEA"}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <input id="city" name="city" defaultValue={p?.city} placeholder="Kumasi" className={inputClass} />
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

      {kind === "international" ? (
        <div className="grid gap-4 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge sm:grid-cols-2">
          <Field
            label="Import duty (%)"
            htmlFor="dutyPercent"
            hint="Charged on the landed value. Leave at 0 to use the platform default. Ignored when the forwarder's rate already covers duty, which is the usual case."
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
      ) : (
        // The fields still submit, at zero, so switching a point from
        // international to local clears the duty rather than leaving it behind
        // where nothing displays it and the pricing still finds it.
        <>
          <input type="hidden" name="dutyPercent" value="0" />
          <input type="hidden" name="clearingFee" value="0" />
        </>
      )}

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
        <Link href="/admin/shipping/points" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
