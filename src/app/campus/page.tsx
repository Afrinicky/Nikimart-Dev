import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CampusShowcase } from "@/components/home/CampusShowcase";
import { getProducts, getVendors, getVendorNameMap } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop by Campus — NikiMart",
};

export default async function CampusPage() {
  const [products, vendors, vendorNames] = await Promise.all([
    getProducts(),
    getVendors(),
    getVendorNameMap(),
  ]);
  return (
    <>
      <PageHeader
        title="Shop by Campus, Institution, or Community"
        subtitle="Choose your campus, institution, or community to discover nearby vendors, products, and delivery options."
        crumbs={[{ label: "Campus" }]}
      />
      <CampusShowcase products={products} vendors={vendors} vendorNames={vendorNames} />
    </>
  );
}
