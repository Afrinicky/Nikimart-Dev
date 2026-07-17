import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import type { Product } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { ScrollRail, RailItem } from "@/components/ui/ScrollRail";
import { ProductCard } from "@/components/product/ProductCard";
import { FlashCountdown } from "./FlashCountdown";

/**
 * Jumia-style flash-sales block: a bold red header bar carrying the title, a
 * live countdown, and a "See all" link, above a horizontal rail of product
 * cards with stock-urgency bars. Hidden entirely when there are no deals.
 */
export function FlashSaleSection({
  title = "Flash Sales",
  viewAllHref,
  products,
  vendorNames,
}: {
  title?: string;
  viewAllHref?: string;
  products: Product[];
  vendorNames?: Record<string, string>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="py-5 sm:py-7">
      <Container>
        <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-gradient-to-r from-niki-danger to-[#c81e5b] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
                <Zap className="h-4 w-4 fill-white" />
              </span>
              <h2 className="font-display text-lg font-bold text-white sm:text-xl">{title}</h2>
            </div>
            <FlashCountdown />
            {viewAllHref ? (
              <Link
                href={viewAllHref}
                className="group flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white"
              >
                See all
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : null}
          </div>

          <div className="bg-white p-3 sm:p-4">
            <ScrollRail>
              {products.map((product) => (
                <RailItem key={product.id}>
                  <ProductCard product={product} vendorName={vendorNames?.[product.vendorId]} flashSale />
                </RailItem>
              ))}
            </ScrollRail>
          </div>
        </div>
      </Container>
    </section>
  );
}
