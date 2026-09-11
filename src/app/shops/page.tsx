import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { VendorCard } from "@/components/vendor/VendorCard";
import { getVendors } from "@/lib/catalog";

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
  title: "Shops & Vendors — Nickimart",
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
