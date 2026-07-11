import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { getServiceProducts, getVendorNameMap } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Services — NikiMart",
};

export default async function ServicesPage() {
  const [serviceProducts, vendorNames] = await Promise.all([
    getServiceProducts(),
    getVendorNameMap(),
  ]);
  return (
    <>
      <PageHeader
        title="Services Near You"
        subtitle="Book trusted local professionals for laundry, repairs, printing, makeup, cleaning and more."
        crumbs={[{ label: "Services" }]}
      />

      <Container className="py-8">
        <ProductGrid products={serviceProducts} vendorNames={vendorNames} />
      </Container>
    </>
  );
}
