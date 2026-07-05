import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { preorderProducts } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Preorder Deals — NikiMart",
};

export default function PreordersPage() {
  return (
    <>
      <PageHeader
        title="Preorder Deals"
        subtitle="Reserve imported and upcoming products from trusted sellers with a deposit."
        crumbs={[{ label: "Preorders" }]}
      />

      <Container className="py-8">
        <div className="mb-6 rounded-2xl bg-niki-gold/10 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-niki-gold/30">
          <strong className="font-semibold">How preorders work:</strong> These items are imported
          on order. You pay a deposit to reserve your item, then settle the balance on arrival before
          delivery or pickup. Always review the estimated arrival date, deposit requirement, balance
          rule, and refund policy on each product before ordering.
        </div>

        <ProductGrid products={preorderProducts} />
      </Container>
    </>
  );
}
