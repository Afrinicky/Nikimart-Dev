import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, ShieldCheck, Star, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { locations } from "@/lib/mock-data";
import { getProductsByVendorId, getVendorBySlug } from "@/lib/catalog";
import { SELLER_TYPE_LABELS } from "@/lib/types";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  return { title: vendor ? `${vendor.businessName} — NikiMart` : "Shop — NikiMart" };
}

export default async function ShopDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const items = await getProductsByVendorId(vendor.id);
  const vendorNames = { [vendor.id]: vendor.businessName };
  const locationNames = vendor.locationIds
    .map((id) => locations.find((l) => l.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <>
      <div
        className="relative"
        style={{
          background: `linear-gradient(135deg, ${vendor.accentFrom} 0%, ${vendor.accentTo} 100%)`,
        }}
      >
        <Container className="py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/15 font-display text-2xl font-bold text-white ring-1 ring-white/25 backdrop-blur">
              {vendor.initials}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
                  {vendor.businessName}
                </h1>
                {vendor.verificationStatus === "verified" ? (
                  <ShieldCheck className="h-6 w-6 text-white" />
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-niki-gold text-niki-gold" />
                  <span className="font-semibold text-white">{vendor.rating.toFixed(1)}</span>
                  ({vendor.reviewCount})
                </span>
                <span>{vendor.totalSales.toLocaleString()}+ sales</span>
                {locationNames.length > 0 ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {locationNames.join(", ")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vendor.sellerTypes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/20"
                  >
                    {SELLER_TYPE_LABELS[t]}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm text-white/80">{vendor.description}</p>
        </Container>
      </div>

      <Container className="py-8">
        <SectionHeading
          title={`Products from ${vendor.businessName}`}
          icon={<Store className="h-5 w-5 text-niki-orange" />}
        />
        {items.length > 0 ? (
          <ProductGrid products={items} vendorNames={vendorNames} />
        ) : (
          <EmptyState
            title="No products listed yet"
            message="This shop hasn't listed any products yet. Check back soon."
            actionLabel="Explore other shops"
            actionHref="/shops"
          />
        )}
      </Container>
    </>
  );
}
