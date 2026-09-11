import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CampusShowcase } from "@/components/home/CampusShowcase";
import { getProducts, getVendors, getVendorNameMap } from "@/lib/catalog";

// Catalogue pages change when a seller edits a listing, not by the second, and
// they are the pages crawlers hit hardest, so one render should serve a minute
// of traffic rather than one visitor.
//
// This has no effect yet. The site header calls `auth()` to decide whether to
// say "Account" or "Sign in", and reading the session reads cookies, which
// makes every route in the app dynamic no matter what is set here. The header
// has to stop doing that on the server before any of these pages can be cached
// — see the note in src/components/layout/Header.tsx. Left in place because it
// is the right setting and becomes live the moment that changes.
export const revalidate = 60;


export const metadata: Metadata = {
  title: "Shop by Campus — Nickimart",
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
