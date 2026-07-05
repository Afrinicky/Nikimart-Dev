import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "My Orders — NikiMart",
};

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="My Orders" crumbs={[{ label: "Orders" }]} />
      <Container className="py-8">
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No orders yet"
          message="When you place an order, it'll show up here so you can track delivery or pickup. Order history arrives with accounts in the next update."
          actionLabel="Start shopping"
          actionHref="/products"
        />
      </Container>
    </>
  );
}
