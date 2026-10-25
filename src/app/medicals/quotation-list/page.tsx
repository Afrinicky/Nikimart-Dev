import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { BasketView } from "@/components/medical/basket/BasketView";

export const metadata: Metadata = {
  title: "Quotation list",
  robots: { index: false, follow: false },
};

export default function QuotationListPage() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={[{ href: "/medicals", label: "Home" }, { label: "Quotation list" }]} />
      <h1 className="medi-h1 mt-6">Your quotation list</h1>
      <p className="medi-lede mt-2.5 text-medi-body">
        Everything you want priced, in one request. Add as many lines as you
        need — and if something is not in the catalogue at all, you can describe
        it on the next step.
      </p>
      <BasketView list="quote" />
    </div>
  );
}
