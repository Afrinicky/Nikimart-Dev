"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updateSellerShop, type SellerShopState } from "@/lib/seller-actions";

interface Shop {
  businessName: string;
  description: string;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  sameDayDeliveryAvailable: boolean;
  payoutMethod: string;
  momoNumber: string;
  momoName: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
}

export function ShopSettingsForm({ shop }: { shop: Shop }) {
  const [state, formAction] = useActionState<SellerShopState, FormData>(updateSellerShop, {});
  const saved = state.ok === true;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Shop profile</h2>
        <div className="mt-4 space-y-4">
          <Field label="Shop name" htmlFor="businessName" hint={state.fieldErrors?.businessName}>
            <input id="businessName" name="businessName" defaultValue={shop.businessName} className={inputClass} />
          </Field>
          <Field label="About your shop" htmlFor="description" hint="Shown on your shop page to buyers.">
            <textarea id="description" name="description" rows={4} defaultValue={shop.description} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Delivery options</h2>
        <p className="mt-1 text-sm text-niki-ink/60">How buyers can receive orders from your shop.</p>
        <div className="mt-4 space-y-3">
          {[
            { name: "deliveryAvailable", label: "Offer delivery", checked: shop.deliveryAvailable },
            { name: "pickupAvailable", label: "Offer pickup", checked: shop.pickupAvailable },
            { name: "sameDayDeliveryAvailable", label: "Offer same-day delivery", checked: shop.sameDayDeliveryAvailable },
          ].map((o) => (
            <label key={o.name} className="flex items-center gap-3 rounded-xl bg-niki-surface px-4 py-3 text-sm font-medium text-niki-ink">
              <input type="checkbox" name={o.name} defaultChecked={o.checked} className="h-4 w-4 accent-niki-orange" />
              {o.label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Payout details</h2>
        <p className="mt-1 text-sm text-niki-ink/60">Where NikiMart sends your earnings. Required before you can request a payout.</p>
        <div className="mt-4 space-y-4">
          <Field label="Preferred method" htmlFor="payoutMethod">
            <select id="payoutMethod" name="payoutMethod" defaultValue={shop.payoutMethod} className={inputClass}>
              <option value="">Not set</option>
              <option value="momo">Mobile Money</option>
              <option value="bank">Bank transfer</option>
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="MoMo number" htmlFor="momoNumber" hint="For Mobile Money payouts">
              <input id="momoNumber" name="momoNumber" defaultValue={shop.momoNumber} placeholder="024 000 0000" className={inputClass} />
            </Field>
            <Field label="MoMo account name" htmlFor="momoName">
              <input id="momoName" name="momoName" defaultValue={shop.momoName} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bank name" htmlFor="bankName">
              <input id="bankName" name="bankName" defaultValue={shop.bankName} className={inputClass} />
            </Field>
            <Field label="Account number" htmlFor="bankAccountNumber">
              <input id="bankAccountNumber" name="bankAccountNumber" defaultValue={shop.bankAccountNumber} className={inputClass} />
            </Field>
            <Field label="Account name" htmlFor="bankAccountName">
              <input id="bankAccountName" name="bankAccountName" defaultValue={shop.bankAccountName} className={inputClass} />
            </Field>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>Save shop</SubmitButton>
        </div>
        {saved ? <span className="text-sm font-medium text-niki-success">Saved ✓</span> : null}
      </div>
    </form>
  );
}
