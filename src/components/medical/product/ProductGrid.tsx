import { PackageSearch } from "lucide-react";
import { ProductCard } from "@/components/medical/product/ProductCard";
import type { ProductSummary } from "@/lib/medical/catalogue";

/**
 * A grid of products, with the empty state it needs.
 *
 * `auto-fit` with a floor of 15rem rather than breakpoint columns: the grid
 * appears beside a sidebar on some pages and full width on others, and a
 * column count tied to the viewport gets one of those two wrong.
 */
export function ProductGrid({
  products,
  empty,
  renderAction,
}: {
  products: ProductSummary[];
  empty?: { title: string; body: string; action?: React.ReactNode };
  /** A per-product control for the card's bottom row — see ProductCard. */
  renderAction?: (product: ProductSummary) => React.ReactNode;
}) {
  if (products.length === 0) {
    return (
      <div className="medi-panel medi-panel-lg px-6 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-medi-mint-50 text-medi-teal-600">
          <PackageSearch className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="medi-h3 mt-4">{empty?.title ?? "Nothing here yet"}</h2>
        <p className="medi-prose mx-auto mt-2 text-[0.875rem] text-medi-body">
          {empty?.body ?? "Nothing in this part of the catalogue matches what you asked for."}
        </p>
        {empty?.action ? <div className="mt-6">{empty.action}</div> : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          action={renderAction?.(product)}
        />
      ))}
    </div>
  );
}
