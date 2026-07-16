"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function PickupPointForm({
  action,
  point,
  operators,
  currentOperatorId,
  submitLabel,
}: {
  action: Action;
  point?: { name: string; code: string; locationName: string; address: string; isActive: boolean };
  operators: { id: string; name: string | null; email: string | null }[];
  currentOperatorId?: string | null;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const p = point;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" defaultValue={p?.name} required className={inputClass} placeholder="NikiMart Pickup — Legon" />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short unique code, e.g. UG-LEGON"}>
          <input id="code" name="code" defaultValue={p?.code} required className={inputClass} />
        </Field>
      </div>

      <Field label="Location name" htmlFor="locationName">
        <input id="locationName" name="locationName" defaultValue={p?.locationName} className={inputClass} placeholder="University of Ghana, Legon" />
      </Field>

      <Field label="Address" htmlFor="address">
        <textarea id="address" name="address" defaultValue={p?.address} required rows={2} className={inputClass} />
      </Field>

      <Field label="Operator (pickup account)" htmlFor="operatorId">
        <select id="operatorId" name="operatorId" defaultValue={currentOperatorId ?? ""} className={inputClass}>
          <option value="">— none —</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name ?? o.email}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="h-4 w-4 rounded" />
        Active (available at checkout)
      </label>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/pickup-points" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
