import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { CheckoutRoutes } from "@/components/medical/basket/CheckoutRoutes";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";
import { isMedicalConfigured } from "@/lib/medical/db";
import { businessContact } from "@/lib/medical/contact";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * The end of the cart, as it stands.
 *
 * Online payment on the medical side is not built: the payment module routes
 * by reference prefix for retail and the bundle platform, and adding a third
 * account touches an integration the mall depends on — that is its own change,
 * with its own test plan, not a corner of this one.
 *
 * What this page does instead is tell the truth and keep the sale: the cart
 * becomes a quotation request in one click, which is a flow that works end to
 * end today, or they ring us.
 */
export default async function MedicalCheckoutPage() {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const contact = await businessContact();

  return (
    <div className="mx-auto max-w-[44rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[
          { href: "/medicals", label: "Home" },
          { href: "/medicals/cart", label: "Cart" },
          { label: "Checkout" },
        ]}
      />

      <header className="mt-6">
        <h1 className="medi-h1 text-medi-ink">Checkout</h1>
        <p className="medi-lede mt-2.5 text-medi-body">
          Paying by card or mobile money is not available on this part of the site.
          Here are the two ways to complete this order.
        </p>
      </header>

      <div className="mt-8">
        <CheckoutRoutes phone={contact.phone} />
      </div>
    </div>
  );
}
