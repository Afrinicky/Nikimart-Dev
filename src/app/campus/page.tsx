import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CampusShowcase } from "@/components/home/CampusShowcase";

export const metadata: Metadata = {
  title: "Shop by Campus — NikiMart",
};

export default function CampusPage() {
  return (
    <>
      <PageHeader
        title="Shop by Campus, Institution, or Community"
        subtitle="Choose your campus, institution, or community to discover nearby vendors, products, and delivery options."
        crumbs={[{ label: "Campus" }]}
      />
      <CampusShowcase />
    </>
  );
}
