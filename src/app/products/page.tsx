import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { categories, filterProducts, getCategoryBySlug } from "@/lib/mock-data";
import { BADGE_LABELS } from "@/lib/types";
import type { BadgeKind } from "@/lib/types";
import Link from "next/link";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "All Products — NikiMart",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const category = first(sp.category);
  const badge = first(sp.badge);
  const maxPriceRaw = first(sp.maxPrice);
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  const results = filterProducts({
    q,
    category,
    badge,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
  });

  const activeCategory = category ? getCategoryBySlug(category) : undefined;

  let title = "All Products";
  if (q) title = `Results for “${q}”`;
  else if (activeCategory) title = activeCategory.name;
  else if (badge && BADGE_LABELS[badge as BadgeKind]) title = BADGE_LABELS[badge as BadgeKind];
  else if (maxPrice) title = `Under GH₵${maxPrice}`;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${results.length} ${results.length === 1 ? "product" : "products"} found`}
        crumbs={[{ label: "Products" }]}
      />

      <Container className="py-8">
        <div className="scrollbar-none -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link
            href="/products"
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              !category
                ? "bg-niki-navy text-white"
                : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5",
            )}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${c.slug}`}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                category === c.slug
                  ? "bg-niki-orange text-white"
                  : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {results.length > 0 ? (
          <ProductGrid products={results} />
        ) : (
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title="No products found"
            message="Try a different category or search term. New products are added to NikiMart every day."
            actionLabel="Browse all products"
            actionHref="/products"
          />
        )}
      </Container>
    </>
  );
}
