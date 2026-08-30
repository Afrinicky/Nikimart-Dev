"use client";

import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { AcceptTerms } from "@/components/ui/AcceptTerms";
import { registerVendor, type VendorRegisterState } from "@/lib/seller-actions";
import { SELLER_TYPE_LABELS, type SellerType } from "@/lib/types";

const SELLER_TYPES = Object.entries(SELLER_TYPE_LABELS) as [SellerType, string][];

function ErrorText({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="mt-1 block text-xs font-medium text-niki-danger">{msg}</span>;
}

export function VendorRegisterForm({
  defaultName,
  defaultEmail,
  defaultPhone,
  hubs = [],
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  hubs?: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<VendorRegisterState, FormData>(registerVendor, {});
  const [payoutMethod, setPayoutMethod] = useState<"momo" | "bank">("momo");
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      {/* 1 — Business details */}
      <section className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink">Business details</h2>
          <p className="text-sm text-niki-ink/50">The basics buyers will see on your shop page.</p>
        </div>

        <Field label="Shop / business name" htmlFor="businessName">
          <input
            id="businessName"
            name="businessName"
            type="text"
            defaultValue={defaultName ?? ""}
            placeholder="e.g. Campus Gadgets Hub"
            className={inputClass}
            required
          />
          <ErrorText msg={fe.businessName} />
        </Field>

        <Field label="What kind of seller are you?" htmlFor="sellerType">
          <select id="sellerType" name="sellerType" className={inputClass} defaultValue="">
            <option value="" disabled>
              Select seller type
            </option>
            {SELLER_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ErrorText msg={fe.sellerType} />
        </Field>

        <Field label="Where do you operate?" htmlFor="location" hint="Campus, institution, town, or city you serve.">
          <input id="location" name="location" type="text" placeholder="e.g. University of Ghana, Accra" className={inputClass} />
        </Field>

        {hubs.length > 0 ? (
          <Field
            label="Origin / consolidation hub"
            htmlFor="originPickupId"
            hint="The Nickimart hub nearest you, where your goods are gathered before shipping to buyers. This sets your shipping fees."
          >
            <select id="originPickupId" name="originPickupId" className={inputClass} defaultValue={hubs[0]?.id ?? ""}>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Tell us about your shop" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={4}
            placeholder="What do you sell? What makes your shop great?"
            className={inputClass}
            required
          />
          <ErrorText msg={fe.description} />
        </Field>
      </section>

      {/* 2 — Contact / account details */}
      <section className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink">Account & contact details</h2>
          <p className="text-sm text-niki-ink/50">How we and your customers reach you about orders.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="email" hint="Shown to buyers. Your sign-in email doesn't change.">
            <input id="email" name="email" type="email" defaultValue={defaultEmail ?? ""} placeholder="shop@example.com" className={inputClass} />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <input id="phone" name="phone" type="tel" defaultValue={defaultPhone ?? ""} placeholder="024 000 0000" className={inputClass} required />
            <ErrorText msg={fe.phone} />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-niki-ink">Fulfilment options</legend>
          <label className="flex items-center gap-3 text-sm text-niki-ink/80">
            <input type="checkbox" name="deliveryAvailable" defaultChecked className="h-4 w-4 rounded border-black/20 text-niki-orange focus:ring-niki-orange" />
            I can deliver orders to buyers
          </label>
          <label className="flex items-center gap-3 text-sm text-niki-ink/80">
            <input type="checkbox" name="pickupAvailable" className="h-4 w-4 rounded border-black/20 text-niki-orange focus:ring-niki-orange" />
            Buyers can pick up from me
          </label>
          <label className="flex items-center gap-3 text-sm text-niki-ink/80">
            <input type="checkbox" name="sameDayDeliveryAvailable" className="h-4 w-4 rounded border-black/20 text-niki-orange focus:ring-niki-orange" />
            I offer same-day delivery
          </label>
        </fieldset>
      </section>

      {/* 3 — Payment / payout details */}
      <section className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink">Payment details</h2>
          <p className="text-sm text-niki-ink/50">Where Nickimart sends your earnings after each settled order. You can change this later in Shop settings.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(["momo", "bank"] as const).map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-2xl border p-4 text-center text-sm font-semibold transition-colors ${
                payoutMethod === m ? "border-niki-orange bg-niki-orange/5 text-niki-ink" : "border-niki-edge-strong text-niki-ink/60 hover:border-black/20"
              }`}
            >
              <input
                type="radio"
                name="payoutMethod"
                value={m}
                checked={payoutMethod === m}
                onChange={() => setPayoutMethod(m)}
                className="sr-only"
              />
              {m === "momo" ? "📱 Mobile Money" : "🏦 Bank account"}
            </label>
          ))}
        </div>
        <ErrorText msg={fe.payoutMethod} />

        {payoutMethod === "momo" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="MoMo number" htmlFor="momoNumber">
              <input id="momoNumber" name="momoNumber" type="tel" placeholder="024 000 0000" className={inputClass} />
              <ErrorText msg={fe.momoNumber} />
            </Field>
            <Field label="Account name" htmlFor="momoName">
              <input id="momoName" name="momoName" type="text" placeholder="Name on the MoMo wallet" className={inputClass} />
              <ErrorText msg={fe.momoName} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Bank name" htmlFor="bankName">
              <input id="bankName" name="bankName" type="text" placeholder="e.g. GCB Bank" className={inputClass} />
              <ErrorText msg={fe.bankName} />
            </Field>
            <Field label="Account number" htmlFor="bankAccountNumber">
              <input id="bankAccountNumber" name="bankAccountNumber" type="text" placeholder="0000000000000" className={inputClass} />
              <ErrorText msg={fe.bankAccountNumber} />
            </Field>
            <Field label="Account holder's name" htmlFor="bankAccountName">
              <input id="bankAccountName" name="bankAccountName" type="text" placeholder="Name on the account" className={inputClass} />
              <ErrorText msg={fe.bankAccountName} />
            </Field>
          </div>
        )}
      </section>

      <div className="space-y-3">
        <AcceptTerms audience="seller" error={state.fieldErrors?.acceptTerms} />

        <SubmitButton>Submit registration</SubmitButton>
        <p className="rounded-xl bg-niki-surface p-3 text-xs text-niki-ink/50">
          {/* The agreement is the checkbox above now, not a line of small print. */}
          Your shop starts as <strong className="text-niki-ink/70">Pending verification</strong> — you
          can add products right away and go live once approved.
        </p>
      </div>
    </form>
  );
}
