import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Your Cart — NikiMart",
};

export default function CartPage() {
  return (
    <>
      <PageHeader title="Your Cart" crumbs={[{ label: "Cart" }]} />
      <Container className="py-8">
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" />}
          title="Your cart is empty"
          message="Browse NikiMart and add products, preorders, or services to your cart. Cart persistence and checkout are coming soon."
          actionLabel="Start shopping"
          actionHref="/products"
        />
      </Container>
    </>
  );
}
