import { Hero } from "@/components/home/Hero";
import { SellCta } from "@/components/home/SellCta";
import { FlashSaleSection } from "@/components/home/FlashSaleSection";
import { AllProductsSection } from "@/components/home/AllProductsSection";
import { TrustStrip } from "@/components/home/TrustStrip";
import {
  countProducts,
  getFlashSaleProducts,
  getHomeProducts,
  getVendorNameMap,
} from "@/lib/catalog";

// The homepage is intentionally rendered directly in code (not from the page
// builder) so the layout is guaranteed and product-first: a promo carousel, a
// short flash-sales rail, then a screen of products to browse right away, with
// the rest a click away at /products.
//
// The homepage is read far more than anything else and changes when a seller
// adds a listing, not by the second — one render should serve a minute of
// traffic rather than one visitor.
//
// This has no effect yet: the site header calls `auth()`, and reading the
// session reads cookies, which makes every route dynamic whatever is set here.
// See the note in src/components/layout/Header.tsx. Left in place because it is
// the right setting and becomes live the moment that changes.
export const revalidate = 60;

export default async function Home() {
  const [products, flashSale, total, vendorNames] = await Promise.all([
    getHomeProducts(),
    getFlashSaleProducts(),
    countProducts(),
    getVendorNameMap(),
  ]);

  return (
    <>
      <Hero />
      <SellCta />
      <FlashSaleSection
        products={flashSale}
        vendorNames={vendorNames}
        viewAllHref="/products?badge=flash_sale"
      />
      <AllProductsSection products={products} vendorNames={vendorNames} total={total} />
      {/* Sits on the homepage rather than the shared layout: the root layout also
          wraps the admin and seller consoles, and a shopper-facing trust band
          has no business above an orders table. */}
      <TrustStrip />
    </>
  );
}
