import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderLookup } from "@/components/global/OrderLookup";

export const metadata: Metadata = {
  title: "Track an Order — NikiMart",
};

export default function OrderTrackingPage() {
  return (
    <>
      <PageHeader
        title="Track an Order"
        subtitle="Enter your order number to see its status, from purchase to pickup."
        crumbs={[{ label: "Order tracking" }]}
      />

      <Container className="py-8">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-8">
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-niki-orange" />
            <h2 className="font-semibold text-niki-ink">Where&apos;s my order?</h2>
          </div>
          <OrderLookup />
        </div>
      </Container>
    </>
  );
}
