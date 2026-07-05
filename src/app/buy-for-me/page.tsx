import type { Metadata } from "next";
import { Link2, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, inputClass } from "@/components/ui/Field";
import { LandedCostEstimator } from "@/components/global/LandedCostEstimator";

export const metadata: Metadata = {
  title: "Buy For Me — NikiMart",
};

const SUPPORTED = ["Amazon", "eBay", "Alibaba", "AliExpress", "Dubai stores", "Any product link"];

export default function BuyForMePage() {
  return (
    <>
      <PageHeader
        title="Buy For Me"
        subtitle="Found something abroad? Paste the link and we'll buy it, ship it, clear customs, and deliver it to your pickup point."
        crumbs={[{ label: "Buy for me" }]}
        tone="dark"
      />

      <Container className="py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          {SUPPORTED.map((s) => (
            <span
              key={s}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-niki-ink/70 ring-1 ring-black/5"
            >
              {s}
            </span>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <form className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-7">
            <Field label="Product link" htmlFor="url" hint="Paste the full link to the product page.">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/40" />
                <input
                  id="url"
                  type="url"
                  placeholder="https://www.amazon.com/..."
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Product name (if known)" htmlFor="name">
                <input id="name" type="text" placeholder="e.g. Lenovo ThinkPad" className={inputClass} />
              </Field>
              <Field label="Source country (if known)" htmlFor="source">
                <select id="source" className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Select source
                  </option>
                  <option>China</option>
                  <option>Dubai / UAE</option>
                  <option>USA</option>
                  <option>Europe</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Quantity" htmlFor="qty">
                <input id="qty" type="number" min={1} placeholder="1" className={inputClass} />
              </Field>
              <Field label="Approx. price (GH₵)" htmlFor="approx" hint="Helps us estimate your quote.">
                <input id="approx" type="number" min={0} placeholder="1000" className={inputClass} />
              </Field>
            </div>

            <Field label="Preferred colour, specs, or notes" htmlFor="notes">
              <textarea id="notes" rows={4} placeholder="Anything we should know?" className={inputClass} />
            </Field>

            <button
              type="button"
              className="w-full rounded-xl bg-niki-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Request my quote
            </button>

            <p className="flex items-center gap-2 rounded-xl bg-niki-surface p-3 text-xs text-niki-ink/60">
              <ShieldCheck className="h-4 w-4 shrink-0 text-niki-success" />
              We&apos;ll review your request and send a full landed-cost quote before you pay anything.
              Request submission goes live with accounts.
            </p>
          </form>

          <LandedCostEstimator defaultPrice={1000} />
        </div>
      </Container>
    </>
  );
}
