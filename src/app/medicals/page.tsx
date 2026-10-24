import type { Metadata } from "next";
import { CategorySidebar } from "@/components/medical/layout/CategorySidebar";
import { HomeHero } from "@/components/medical/home/HomeHero";
import { HowSupplyWorks } from "@/components/medical/home/HowSupplyWorks";
import { CategoryGrid } from "@/components/medical/home/CategoryGrid";
import { QuotationBand } from "@/components/medical/home/QuotationBand";
import { SupportBand } from "@/components/medical/home/SupportBand";
import { ProductRail } from "@/components/medical/product/ProductRail";
import { ProductCard } from "@/components/medical/product/ProductCard";
import { SectionHead } from "@/components/medical/ui/SectionHead";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { getCategoryTree } from "@/lib/medical/categories";
import { blockOfKind, getHomepageBlocks } from "@/lib/medical/homepage";
import {
  getFeaturedProducts,
  getNewArrivals,
  getPopularProducts,
  getProductsInCategory,
} from "@/lib/medical/catalogue";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

export const metadata: Metadata = {
  title: "Nickimart Medical — Laboratory and medical supplies in Ghana",
};

// A minute, matching the rest of the site. Short enough that a price edit shows
// up while the administrator is still looking at it, long enough that a burst
// of traffic costs one render rather than one render per visitor.
export const revalidate = 60;

export default async function MedicalHomePage() {
  if (!isMedicalConfigured()) return <NotConfigured />;

  // Every read falls back to empty rather than throwing, so one slow or absent
  // table costs that section and not the page. Fired together because they are
  // independent and the page waits for the slowest, not for the sum.
  const [blocks, categories, featured, reagents, diagnostics, consumables, newArrivals, popular] =
    await Promise.all([
      getHomepageBlocks(),
      getCategoryTree(),
      getFeaturedProducts(8),
      getProductsInCategory("laboratory-reagents", { take: 4 }),
      getProductsInCategory("laboratory-equipment", { take: 8 }),
      getProductsInCategory("medical-consumables", { take: 8 }),
      getNewArrivals(8),
      getPopularProducts({ take: 8 }),
    ]);

  const sidebarCategories = categories.filter((category) => category.productCount > 0);

  return (
    <>
      {/* The hero sits beside the category column, which is the shape of every
          catalogue a buyer in this trade already uses. The column is real
          navigation rather than decoration, so it is a <nav> and it is the
          same tree the header's menu shows. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="lg:grid lg:grid-cols-[15.5rem_1fr] lg:items-start lg:gap-7">
          <CategorySidebar categories={sidebarCategories} className="hidden lg:block" />
          <HomeHero block={blockOfKind(blocks, "HERO")} />
        </div>
      </section>

      <div className="mx-auto max-w-[80rem] space-y-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <HowSupplyWorks />

        {featured.length > 0 ? (
          <section aria-labelledby="featured">
            <SectionHead
              title="Held in stock"
              description="Lines we keep on the shelf in Accra and can dispatch this week."
              href="/medicals/categories"
              linkLabel="All categories"
            />
            <ProductRail products={featured} className="mt-7" />
          </section>
        ) : null}

        {/* A different shape on purpose. Three rails in a row would make the
            page read as one component repeated, and this section is making a
            different point: here is a department, and here is what is in it. */}
        {reagents.products.length > 0 ? (
          <section aria-labelledby="reagents" className="lg:grid lg:grid-cols-[1fr_2fr] lg:gap-10">
            <div className="rounded-2xl bg-medi-mint-50 p-7 lg:self-start">
              <h2 id="reagents" className="medi-h2">
                Reagents and consumables
              </h2>
              <p className="medi-prose mt-3 text-[0.9375rem] text-medi-body">
                Chemistry and haematology reagents, stains, media and the bench
                consumables that go with them. Cold-chain lines are shipped in
                insulated packaging and only to an address that can receive them.
              </p>
              <MedicalButtonLink
                href="/medicals/categories/laboratory-reagents"
                variant="secondary"
                className="mt-6"
              >
                Browse reagents
              </MedicalButtonLink>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:mt-0">
              {reagents.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {diagnostics.products.length > 0 ? (
          <section aria-labelledby="equipment">
            <SectionHead
              title="Diagnostic and laboratory equipment"
              description="Microscopes, centrifuges and analysers. Quoted with lead time, installation and training where they apply."
              href="/medicals/categories/laboratory-equipment"
            />
            <ProductRail products={diagnostics.products} className="mt-7" />
          </section>
        ) : null}

        {consumables.products.length > 0 ? (
          <section aria-labelledby="consumables">
            <SectionHead
              title="Medical and hospital consumables"
              description="Syringes, dressings, gauze and the things a treatment room goes through every day."
              href="/medicals/categories/medical-consumables"
            />
            <ProductRail products={consumables.products} className="mt-7" />
          </section>
        ) : null}

        {/* Rendered only when there are orders behind it. An empty rail is the
            correct output for a business that has not sold anything yet;
            inventing one is how a dashboard stops being believed. */}
        {popular.length > 0 ? (
          <section aria-labelledby="popular">
            <SectionHead
              title="Most ordered"
              description="By quantity sold over the last ninety days."
            />
            <ProductRail products={popular} className="mt-7" />
          </section>
        ) : null}

        {newArrivals.length > 0 ? (
          <section aria-labelledby="new">
            <SectionHead title="Recently added" />
            <ProductRail products={newArrivals} className="mt-7" />
          </section>
        ) : null}

        <QuotationBand block={blockOfKind(blocks, "PROMO")} />

        {categories.length > 0 ? (
          <section aria-labelledby="all-categories">
            <SectionHead
              title="Everything we supply"
              description="Twelve departments. If it is not listed, ask — we source to order."
            />
            <div className="mt-7">
              <CategoryGrid categories={categories} />
            </div>
          </section>
        ) : null}

        <SupportBand />
      </div>
    </>
  );
}
