"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FREIGHT_MODES, FREIGHT_MODE_LABELS } from "@/lib/abroad";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

/**
 * A freight forwarder: who consolidates a load abroad and brings it to Ghana.
 *
 * "Their price already covers duty and taxes" is the field that decides whether
 * this platform bills a buyer twice. Ghana-bound consolidators quote one rate
 * per cubic metre with the carriage, the port fees, the duty and the taxes all
 * inside it, so it is ticked by default — and the moment it is unticked, duty
 * and VAT are assessed on top and the bill moves a long way.
 */
export function ForwarderForm({
  action,
  forwarder,
  points,
  submitLabel,
  saved = false,
}: {
  action: Action;
  forwarder?: {
    name: string;
    code: string;
    originCountry: string;
    mode: string;
    consolidationPointId: string | null;
    allInclusive: boolean;
    note: string;
    isActive: boolean;
  };
  points: { id: string; label: string }[];
  submitLabel: string;
  saved?: boolean;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const f = forwarder;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">Saved ✓</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint="What sellers will see when they pick a forwarder.">
          <input id="name" name="name" defaultValue={f?.name} required placeholder="Guangzhou Consolidators" className={inputClass} />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short and unique. e.g. GZ-SEA"}>
          <input id="code" name="code" defaultValue={f?.code} required placeholder="GZ-SEA" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Collects in" htmlFor="originCountry" hint="The country they receive goods in.">
          <select id="originCountry" name="originCountry" defaultValue={f?.originCountry ?? ""} className={inputClass}>
            <option value="">Any country</option>
            {FOREIGN_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How they travel" htmlFor="mode" hint="Shown to buyers as the freight method.">
          <select id="mode" name="mode" defaultValue={f?.mode ?? "sea"} className={inputClass}>
            {FREIGHT_MODES.map((m) => (
              <option key={m} value={m}>
                {FREIGHT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Delivers into"
          htmlFor="consolidationPointId"
          hint="The Ghana consolidation point their loads land at. The local run starts there."
        >
          <select
            id="consolidationPointId"
            name="consolidationPointId"
            defaultValue={f?.consolidationPointId ?? ""}
            className={inputClass}
          >
            <option value="">Whatever the listing says</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge">
        <input
          type="checkbox"
          name="allInclusive"
          defaultChecked={f?.allInclusive ?? true}
          className="mt-0.5 h-4 w-4 rounded"
        />
        <span className="text-sm text-niki-ink/80">
          <span className="font-medium text-niki-ink">
            Their price already covers port fees, duty and taxes.
          </span>{" "}
          This is how most Ghana-bound consolidators quote, and it is why nothing is added on top of
          their rate. Untick it only if they invoice you for carriage alone and you settle customs
          separately — duty and VAT are then charged on the landed value.
        </span>
      </label>

      <Field label="Note" htmlFor="note" hint="For your own reference. Not shown to buyers.">
        <textarea id="note" name="note" rows={2} defaultValue={f?.note} className={inputClass} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input type="checkbox" name="isActive" defaultChecked={f?.isActive ?? true} className="h-4 w-4 rounded" />
        Active — sellers can choose this forwarder
      </label>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/shipping/abroad" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Back
        </Link>
      </div>
    </form>
  );
}
