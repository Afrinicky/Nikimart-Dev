"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MapPin, PackageOpen } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { CrudState } from "@/lib/admin-actions";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export interface LocationDraft {
  name: string;
  code: string;
  where: string;
  address: string;
  openingHours: string;
  note: string;
  operatorId: string | null;
  isPickup: boolean;
  isConsolidation: boolean;
  isActive: boolean;
}

/**
 * One place, and what happens there.
 *
 * The two tick boxes are the whole idea. A location used to be typed in twice —
 * once as a pickup point, once as a consolidation point — under two names, on
 * two screens, with nothing saying they were the same shelf. Here they are two
 * roles of one record, and a place that plays both is the ordinary case: goods
 * gather at the station buyers collect from, which is what makes collecting
 * there free.
 */
export function ShippingLocationForm({
  action,
  location,
  operators,
  submitLabel,
}: {
  action: Action;
  location?: LocationDraft;
  operators: { id: string; name: string | null; email: string | null }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const [isPickup, setIsPickup] = useState(location?.isPickup ?? true);
  const [isConsolidation, setIsConsolidation] = useState(location?.isConsolidation ?? true);

  const roles = [
    {
      on: isPickup,
      set: setIsPickup,
      name: "isPickup",
      icon: MapPin,
      title: "Buyers collect here",
      body: "It appears at checkout and on the public pickup-points page, and it becomes a column of the grid.",
    },
    {
      on: isConsolidation,
      set: setIsConsolidation,
      name: "isConsolidation",
      icon: PackageOpen,
      title: "Goods gather here",
      body: "Sellers can consolidate here before a courier takes the load onward, and it becomes a row of the grid.",
    },
  ];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint="What sellers and buyers will see.">
          <input
            id="name"
            name="name"
            defaultValue={location?.name}
            required
            className={inputClass}
            placeholder="NikiMart Pickup — Sunyani"
          />
        </Field>
        <Field label="Code" htmlFor="code" hint={state.fieldErrors?.code ?? "Short and unique, e.g. SUNYANI-MAIN."}>
          <input id="code" name="code" defaultValue={location?.code} required className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Town or campus" htmlFor="where">
          <input
            id="where"
            name="where"
            defaultValue={location?.where}
            className={inputClass}
            placeholder="Sunyani Central"
          />
        </Field>
        <Field label="Address" htmlFor="address">
          <input id="address" name="address" defaultValue={location?.address} className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-niki-ink">What happens here</legend>
        {roles.map(({ on, set, name, icon: Icon, title, body }) => (
          <label
            key={name}
            className="flex items-start gap-3 rounded-xl bg-niki-surface p-4 ring-1 ring-niki-edge"
          >
            <input
              type="checkbox"
              name={name}
              checked={on}
              onChange={(e) => set(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span className="text-sm text-niki-ink/75">
              <span className="flex items-center gap-1.5 font-medium text-niki-ink">
                <Icon className="h-4 w-4 text-niki-orange" />
                {title}
              </span>
              <span className="mt-0.5 block">{body}</span>
            </span>
          </label>
        ))}
        {isPickup && isConsolidation ? (
          <p className="px-1 text-xs text-niki-success">
            Both — so a buyer collecting here pays nothing for goods that are already in the room.
          </p>
        ) : null}
      </fieldset>

      {isPickup ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Collection hours"
            htmlFor="openingHours"
            hint="Shown publicly. Blank uses the site-wide business hours."
          >
            <input
              id="openingHours"
              name="openingHours"
              defaultValue={location?.openingHours}
              className={inputClass}
              placeholder="Mon–Sat, 8am–6pm"
            />
          </Field>
          <Field label="Operator (pickup account)" htmlFor="operatorId">
            <select
              id="operatorId"
              name="operatorId"
              defaultValue={location?.operatorId ?? ""}
              className={inputClass}
            >
              <option value="">— none —</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? o.email}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {isConsolidation ? (
        <Field label="Note" htmlFor="note" hint="Shown to sellers choosing where to consolidate.">
          <input id="note" name="note" defaultValue={location?.note} className={inputClass} />
        </Field>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-niki-ink/80">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={location?.isActive ?? true}
          className="h-4 w-4 rounded"
        />
        Active
      </label>

      <FormFeedback error={state.error} />
      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link
          href="/admin/shipping/locations"
          className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
