"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ProductImagesField } from "@/components/admin/ProductImagesField";
import { KeyAttributesField } from "@/components/admin/KeyAttributesField";
import { AffiliateEnrolmentField } from "@/components/admin/AffiliateEnrolmentField";
import type { CrudState } from "@/lib/admin-actions";
import type { Product } from "@/lib/types";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

const PRODUCT_TYPES = [
  { value: "in_stock", label: "In stock" },
  { value: "preorder", label: "Preorder" },
  { value: "service", label: "Service" },
  { value: "food", label: "Food" },
];

export interface ProductFormCategory {
  id: string;
  name: string;
  /** Platform commission for the category (percent) — drives the affiliate cap. */
  commissionRate?: number | null;
  /** Suggested affiliate commission for the category (percent). */
  affiliateCommissionRate?: number | null;
}

export function ProductForm({
  action,
  categories,
  vendors,
  product,
  submitLabel,
  lockedVendorId,
  actor = "admin",
  cancelHref = "/admin/products",
  defaultCommissionRate,
  defaultAffiliateRate,
}: {
  action: Action;
  categories: ProductFormCategory[];
  vendors: { id: string; businessName: string }[];
  product?: Product;
  submitLabel: string;
  /** When set, the vendor is fixed (seller flow) — no shop picker is shown. */
  lockedVendorId?: string;
  /** Sellers can only enrol products at their own expense. */
  actor?: "admin" | "seller";
  cancelHref?: string;
  /** Platform default commission (percent) when a category has no override. */
  defaultCommissionRate: number;
  /** Programme default affiliate commission (percent). */
  defaultAffiliateRate: number;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const p = product;
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? "");
  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" htmlFor="name" hint={state.fieldErrors?.name}>
          <input id="name" name="name" defaultValue={p?.name} required className={inputClass} />
        </Field>
        <Field label="Slug (optional)" htmlFor="slug" hint={state.fieldErrors?.slug ?? "Auto-generated from name if blank"}>
          <input id="slug" name="slug" defaultValue={p?.slug} className={inputClass} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" hint={state.fieldErrors?.description}>
        <textarea id="description" name="description" defaultValue={p?.description} required rows={3} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price (GH₵)" htmlFor="price" hint={state.fieldErrors?.price}>
          <input id="price" name="price" type="number" step="0.01" min="0" defaultValue={p?.price} required className={inputClass} />
        </Field>
        <Field label="Old price (optional)" htmlFor="oldPrice">
          <input id="oldPrice" name="oldPrice" type="number" step="0.01" min="0" defaultValue={p?.oldPrice ?? ""} className={inputClass} />
        </Field>
        <Field label="Stock quantity" htmlFor="stockQuantity">
          <input id="stockQuantity" name="stockQuantity" type="number" min="0" defaultValue={p?.stockQuantity ?? 0} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Shipping weight (kg)" htmlFor="shippingWeightKg" hint="Used when charging by weight">
          <input id="shippingWeightKg" name="shippingWeightKg" type="number" step="0.1" min="0" defaultValue={p?.shippingWeightKg ?? 0.5} className={inputClass} />
        </Field>
        <Field label="Length (cm)" htmlFor="lengthCm" hint="For size pricing">
          <input id="lengthCm" name="lengthCm" type="number" step="0.1" min="0" defaultValue={p?.lengthCm ?? 0} className={inputClass} />
        </Field>
        <Field label="Width (cm)" htmlFor="widthCm">
          <input id="widthCm" name="widthCm" type="number" step="0.1" min="0" defaultValue={p?.widthCm ?? 0} className={inputClass} />
        </Field>
        <Field label="Height (cm)" htmlFor="heightCm">
          <input id="heightCm" name="heightCm" type="number" step="0.1" min="0" defaultValue={p?.heightCm ?? 0} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Shipping volume (CBM)"
          htmlFor="cbm"
          hint="Cubic metres per unit — the basis of the shipping fee. Leave blank to auto-calculate from L×W×H."
        >
          <input id="cbm" name="cbm" type="number" step="0.0001" min="0" defaultValue={p?.cbm ? p.cbm : ""} placeholder="e.g. 0.045" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="categoryId" hint={state.fieldErrors?.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {lockedVendorId ? (
          <input type="hidden" name="vendorId" value={lockedVendorId} />
        ) : (
          <Field label="Shop" htmlFor="vendorId" hint={state.fieldErrors?.vendorId}>
            <select id="vendorId" name="vendorId" defaultValue={p?.vendorId ?? ""} required className={inputClass}>
              <option value="" disabled>
                Choose…
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.businessName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Product type" htmlFor="productType">
          <select id="productType" name="productType" defaultValue={p?.productType ?? "in_stock"} className={inputClass}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ProductImagesField initial={p?.images} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emoji" htmlFor="emoji" hint="Fallback icon when there's no image">
          <input id="emoji" name="emoji" defaultValue={p?.emoji ?? "🛍️"} className={inputClass} />
        </Field>
        <Field label="Badges (comma-separated)" htmlFor="badges" hint="e.g. in_stock, flash_sale">
          <input id="badges" name="badges" defaultValue={p?.badges.join(", ")} className={inputClass} />
        </Field>
      </div>

      <KeyAttributesField initial={p?.attributes} />

      <AffiliateEnrolmentField
        actor={actor}
        enabled={p?.affiliateEnabled ?? false}
        enrolledBy={p?.affiliateEnrolledBy ?? ""}
        rate={p?.affiliateCommissionRate ?? null}
        categoryAffiliateRate={selectedCategory?.affiliateCommissionRate ?? null}
        platformCommissionRate={selectedCategory?.commissionRate ?? defaultCommissionRate}
        defaultAffiliateRate={defaultAffiliateRate}
      />

      <fieldset className="rounded-xl bg-niki-surface p-4 ring-1 ring-black/5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
          Flags
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["isFeatured", "Featured", p?.isFeatured],
            ["isOfficial", "Official", p?.isOfficial],
            ["pickupAvailable", "Pickup", p?.pickupAvailable],
            ["campusDeliveryAvailable", "Campus delivery", p?.campusDeliveryAvailable],
            ["sameDayDeliveryAvailable", "Same-day delivery", p?.sameDayDeliveryAvailable],
          ].map(([name, label, checked]) => (
            <label key={name as string} className="flex items-center gap-2 text-sm text-niki-ink/80">
              <input type="checkbox" name={name as string} defaultChecked={Boolean(checked)} className="h-4 w-4 rounded" />
              {label as string}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl bg-niki-surface p-4 ring-1 ring-black/5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">Affiliate program</legend>
        <label className="flex items-center gap-2 text-sm font-medium text-niki-ink">
          <input type="checkbox" name="affiliateEnabled" defaultChecked={Boolean(p?.affiliateEnabled)} className="h-4 w-4 rounded" />
          Available to affiliates (they can promote it and earn on referred sales)
        </label>
        <div className="mt-3 max-w-xs">
          <Field label="Affiliate commission (%)" htmlFor="affiliateCommission" hint="Blank = use the program default rate">
            <input
              id="affiliateCommission"
              name="affiliateCommission"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={p?.affiliateCommission ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <input type="hidden" name="locationIds" value={product?.locationIds.join(",") ?? "any"} />

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href={cancelHref} className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
