"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";
import type { Vendor } from "@/lib/types";
import { COUNTRIES } from "@/lib/countries";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function VendorForm({
  action,
  vendor,
  owners,
  currentOwnerId,
  submitLabel,
}: {
  action: Action;
  vendor?: Vendor;
  owners: { id: string; name: string | null; email: string | null }[];
  currentOwnerId?: string | null;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const v = vendor;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName" hint={state.fieldErrors?.businessName}>
          <input id="businessName" name="businessName" defaultValue={v?.businessName} required className={inputClass} />
        </Field>
        <Field label="Slug (optional)" htmlFor="slug" hint={state.fieldErrors?.slug ?? "Auto-generated if blank"}>
          <input id="slug" name="slug" defaultValue={v?.slug} className={inputClass} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" hint={state.fieldErrors?.description}>
        <textarea id="description" name="description" defaultValue={v?.description} required rows={2} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Initials" htmlFor="initials" hint="Auto from name if blank">
          <input id="initials" name="initials" defaultValue={v?.initials} maxLength={3} className={inputClass} />
        </Field>
        <Field label="Verification" htmlFor="verificationStatus">
          <select id="verificationStatus" name="verificationStatus" defaultValue={v?.verificationStatus ?? "pending"} className={inputClass}>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <Field label="Seller types (comma-separated)" htmlFor="sellerTypes" hint="e.g. local_shop, food_vendor">
          <input id="sellerTypes" name="sellerTypes" defaultValue={v?.sellerTypes.join(", ")} className={inputClass} />
        </Field>
      </div>

      <Field label="Ships from" htmlFor="originCountry" hint="Non-Ghana sellers' products are marked “shipped from abroad”">
        <select id="originCountry" name="originCountry" defaultValue={v?.originCountry ?? "GH"} className={inputClass}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Accent from" htmlFor="accentFrom">
          <input id="accentFrom" name="accentFrom" type="color" defaultValue={v?.accentFrom ?? "#FF8A00"} className={`${inputClass} h-11 p-1`} />
        </Field>
        <Field label="Accent to" htmlFor="accentTo">
          <input id="accentTo" name="accentTo" type="color" defaultValue={v?.accentTo ?? "#FFC107"} className={`${inputClass} h-11 p-1`} />
        </Field>
        <Field label="Owner (seller account)" htmlFor="ownerId">
          <select id="ownerId" name="ownerId" defaultValue={currentOwnerId ?? ""} className={inputClass}>
            <option value="">— none —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name ?? o.email}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rating" htmlFor="rating">
          <input id="rating" name="rating" type="number" step="0.1" min="0" max="5" defaultValue={v?.rating ?? 0} className={inputClass} />
        </Field>
        <Field label="Review count" htmlFor="reviewCount">
          <input id="reviewCount" name="reviewCount" type="number" min="0" defaultValue={v?.reviewCount ?? 0} className={inputClass} />
        </Field>
        <Field label="Total sales" htmlFor="totalSales">
          <input id="totalSales" name="totalSales" type="number" min="0" defaultValue={v?.totalSales ?? 0} className={inputClass} />
        </Field>
      </div>

      <fieldset className="rounded-xl bg-niki-surface p-4 ring-1 ring-black/5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">Flags</legend>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["isOfficial", "Official", v?.isOfficial],
            ["deliveryAvailable", "Delivery", v?.deliveryAvailable],
            ["pickupAvailable", "Pickup", v?.pickupAvailable],
            ["sameDayDeliveryAvailable", "Same-day", v?.sameDayDeliveryAvailable],
          ].map(([name, label, checked]) => (
            <label key={name as string} className="flex items-center gap-2 text-sm text-niki-ink/80">
              <input type="checkbox" name={name as string} defaultChecked={Boolean(checked)} className="h-4 w-4 rounded" />
              {label as string}
            </label>
          ))}
        </div>
      </fieldset>

      <input type="hidden" name="locationIds" value={vendor?.locationIds.join(",") ?? "any"} />

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/vendors" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
