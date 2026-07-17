import type { ReactNode } from "react";
import type { Product } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollRail, RailItem } from "@/components/ui/ScrollRail";
import { ProductCard } from "@/components/product/ProductCard";

export function ProductSection({
  title,
  subtitle,
  viewAllHref,
  products,
  vendorNames,
  icon,
  notice,
  headerExtra,
  tone = "light",
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  products: Product[];
  vendorNames?: Record<string, string>;
  icon?: ReactNode;
  notice?: ReactNode;
  headerExtra?: ReactNode;
  tone?: "light" | "dark";
}) {
  if (products.length === 0) return null;

  return (
    <section className={tone === "dark" ? "bg-niki-navy py-10 sm:py-12" : "py-10 sm:py-12"}>
      <Container>
        <div className={tone === "dark" ? "[&_h2]:text-white [&_p]:text-white/60" : ""}>
          <SectionHeading
            title={title}
            subtitle={subtitle}
            viewAllHref={viewAllHref}
            icon={icon}
            extra={headerExtra}
          />
        </div>
        {notice}
        <ScrollRail>
          {products.map((product) => (
            <RailItem key={product.id}>
              <ProductCard product={product} vendorName={vendorNames?.[product.vendorId]} />
            </RailItem>
          ))}
        </ScrollRail>
      </Container>
    </section>
  );
}
