import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { ProductGrid } from "@/components/medical/product/ProductGrid";
import { SaveButton } from "@/components/medical/account/SaveButton";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";
import { isMedicalConfigured } from "@/lib/medical/db";
import { requireMedicalCustomer } from "@/lib/medical/customer";
import { getSavedProducts } from "@/lib/medical/account/queries";

export const metadata: Metadata = {
  title: "Saved products",
  robots: { index: false, follow: false },
};

/**
 * The products somebody has put aside.
 *
 * Saving is the step before asking for a price: a laboratory manager finds
 * four analysers over a fortnight and wants them in one place before deciding.
 * So the page is the catalogue grid rather than a stripped-down list — the
 * same cards, with the same add control, and a remove in place of the
 * "Quotation" note.
 *
 * A product that has been delisted since it was saved is not shown, and the
 * query filters it rather than the component: a card that renders a price for
 * something nobody can buy is worse than one fewer card.
 */
export default async function SavedProductsPage() {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const customer = await requireMedicalCustomer("/medicals/account/saved");
  const products = await getSavedProducts(customer.customerId);

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[
          { href: "/medicals", label: "Home" },
          { href: "/medicals/account", label: "Account" },
          { label: "Saved" },
        ]}
      />

      <header className="mt-6">
        <h1 className="medi-h1 text-medi-ink">Saved products</h1>
        <p className="medi-lede mt-2.5 text-medi-body">
          {products.length === 0
            ? "Nothing saved yet."
            : `${products.length} ${products.length === 1 ? "product" : "products"}, newest first.`}
        </p>
      </header>

      <div className="mt-7">
        <ProductGrid
          products={products}
          renderAction={(product) => (
            <SaveButton productId={product.id} initialSaved variant="icon" />
          )}
          empty={{
            title: "Nothing saved yet",
            body:
              "Save a product from its page and it waits here until you are ready to " +
              "order it or ask for a price.",
            action: (
              <MedicalButtonLink href="/medicals/categories">
                Browse the catalogue
              </MedicalButtonLink>
            ),
          }}
        />
      </div>
    </div>
  );
}
