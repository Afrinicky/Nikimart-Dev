import { Hero } from "@/components/home/Hero";
import { SellCta } from "@/components/home/SellCta";
import { FlashSaleSection } from "@/components/home/FlashSaleSection";
import { AllProductsSection } from "@/components/home/AllProductsSection";
import { getProducts, getVendorNameMap } from "@/lib/catalog";

// The homepage is intentionally rendered directly in code (not from the page
// builder) so the layout is guaranteed and product-first: a promo carousel, a
// short flash-sales rail, then the full product catalogue to browse right away.
export default async function Home() {
  const [products, vendorNames] = await Promise.all([getProducts(), getVendorNameMap()]);
  const flashSale = products.filter((p) => p.badges.includes("flash_sale"));

  return (
    <>
      <Hero />
      <SellCta />
      <FlashSaleSection
        products={flashSale}
        vendorNames={vendorNames}
        viewAllHref="/products?badge=flash_sale"
      />
      <AllProductsSection products={products} vendorNames={vendorNames} />
    </>
  );
}
