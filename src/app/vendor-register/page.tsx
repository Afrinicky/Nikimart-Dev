import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, inputClass } from "@/components/ui/Field";
import { SELLER_TYPE_LABELS } from "@/lib/types";
import type { SellerType } from "@/lib/types";

export const metadata: Metadata = {
  title: "Register your shop — NikiMart",
};

const SELLER_TYPES = Object.entries(SELLER_TYPE_LABELS) as [SellerType, string][];

export default function VendorRegisterPage() {
  return (
    <>
      <PageHeader
        title="Register your shop"
        subtitle="Tell us about your business to start selling on NikiMart."
        crumbs={[{ label: "Sell", href: "/sell" }, { label: "Register" }]}
      />
      <Container className="py-8">
        <form className="mx-auto max-w-2xl space-y-5 rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-8">
          <Field label="Business name" htmlFor="business">
            <input id="business" type="text" placeholder="e.g. Campus Gadgets Hub" className={inputClass} />
          </Field>

          <Field label="What kind of seller are you?" htmlFor="type">
            <select id="type" className={inputClass} defaultValue="">
              <option value="" disabled>
                Select seller type
              </option>
              {SELLER_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact email" htmlFor="email">
              <input id="email" type="email" placeholder="shop@example.com" className={inputClass} />
            </Field>
            <Field label="Phone number" htmlFor="phone">
              <input id="phone" type="tel" placeholder="024 000 0000" className={inputClass} />
            </Field>
          </div>

          <Field label="Where do you operate?" htmlFor="location" hint="Campus, institution, town, or city you serve.">
            <input id="location" type="text" placeholder="e.g. University of Ghana, Accra" className={inputClass} />
          </Field>

          <Field label="Tell us about your shop" htmlFor="about">
            <textarea
              id="about"
              rows={4}
              placeholder="What do you sell? What makes your shop great?"
              className={inputClass}
            />
          </Field>

          <button
            type="button"
            className="w-full rounded-xl bg-niki-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light sm:w-auto sm:px-8"
          >
            Submit registration
          </button>

          <p className="rounded-xl bg-niki-surface p-3 text-xs text-niki-ink/50">
            Seller onboarding &amp; verification (KYC) are being wired up — this form is a visual
            preview for now.
          </p>
        </form>
      </Container>
    </>
  );
}
