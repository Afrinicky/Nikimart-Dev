import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { BasketView } from "@/components/medical/basket/BasketView";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={[{ href: "/medicals", label: "Home" }, { label: "Cart" }]} />
      <h1 className="medi-h1 mt-6">Your cart</h1>
      <p className="medi-lede mt-2.5 text-medi-body">
        Items you can buy outright. Anything priced on request belongs on your
        quotation list instead — you can move lines between the two.
      </p>
      <BasketView list="cart" />
    </div>
  );
}
