import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { Product } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/product/ProductGrid";

/**
 * The main homepage browse surface: a dense, responsive grid of every product,
 * so shoppers land straight into browsing the full catalogue (Alibaba-style)
 * without navigating away.
 */
export function AllProductsSection({
  products,
  vendorNames,
}: {
  products: Product[];
  vendorNames?: Record<string, string>;
}) {
  if (products.length === 0) {
    // Empty almost always means the catalogue couldn't be loaded (e.g. a brief
    // database hiccup). Show a friendly prompt rather than a blank page.
    return (
      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-orange">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Products are taking a moment</h2>
            <p className="mt-2 text-sm text-niki-ink/60">
              We couldn&apos;t load the catalogue right now. Please refresh in a moment.
            </p>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8">
      <Container>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-niki-ink sm:text-2xl">
              <LayoutGrid className="h-5 w-5 text-niki-orange" />
              Explore all products
            </h2>
            <p className="mt-1 text-sm text-niki-ink/60">
              {products.length} items from shops across Ghana and abroad
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/5 transition-colors hover:bg-niki-navy/5"
          >
            Filter &amp; search
          </Link>
        </div>
        <ProductGrid products={products} vendorNames={vendorNames} />
      </Container>
    </section>
  );
}
