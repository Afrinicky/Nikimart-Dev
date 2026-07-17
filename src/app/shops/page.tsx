import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { VendorCard } from "@/components/vendor/VendorCard";
import { getVendors } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shops & Vendors — NikiMart",
};

export default async function ShopsPage() {
  const vendors = await getVendors();
  return (
    <>
      <PageHeader
        title="Shops & Vendors"
        subtitle="Discover trusted local shops, campus vendors, food vendors, and service providers across Ghana."
        crumbs={[{ label: "Shops" }]}
      />

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} />
          ))}
        </div>
      </Container>
    </>
  );
}
