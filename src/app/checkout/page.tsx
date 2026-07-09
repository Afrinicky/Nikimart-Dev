import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Checkout — NikiMart",
};

export default function CheckoutPage() {
  return (
    <>
      <PageHeader title="Checkout" crumbs={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <Container className="py-8">
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="Checkout is coming soon"
          message="Secure checkout with local payments (Mobile Money, card) and delivery or pickup options is being built. Add items to your cart in the meantime."
          actionLabel="Continue shopping"
          actionHref="/products"
        />
      </Container>
    </>
  );
}
