"use client";

import { GraduationCap, MapPin, PackageCheck, Truck } from "lucide-react";
import { useLocation } from "@/components/providers/LocationProvider";
import type { Product, Vendor } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollRail, RailItem } from "@/components/ui/ScrollRail";
import { cn } from "@/lib/cn";
import { VendorCard } from "@/components/vendor/VendorCard";
import { ProductCard } from "@/components/product/ProductCard";

function matchesLocation(ids: string[], locationId: string): boolean {
  if (locationId === "any") return true;
  return ids.includes(locationId) || ids.includes("any");
}

export function CampusShowcase({
  products,
  vendors,
  vendorNames,
}: {
  products: Product[];
  vendors: Vendor[];
  vendorNames?: Record<string, string>;
}) {
  const { locations, selectedLocationId, setSelectedLocationId } = useLocation();
  const selected = locations.find((l) => l.id === selectedLocationId) ?? locations[0];

  const vendorMatches = vendors
    .filter((v) => matchesLocation(v.locationIds, selectedLocationId))
    .slice(0, 6);
  const productMatches = products
    .filter((p) => matchesLocation(p.locationIds, selectedLocationId))
    .slice(0, 10);
  const sameDayCount = productMatches.filter((p) => p.sameDayDeliveryAvailable).length;
  const pickupCount = productMatches.filter((p) => p.pickupAvailable).length;

  return (
    <section className="border-y border-black/5 bg-white py-10 sm:py-12">
      <Container>
        <SectionHeading
          title="Shop by Campus, Institution, or Community"
          subtitle="Choose your campus, institution, or community to discover nearby vendors, products, and delivery options."
          icon={<GraduationCap className="h-5 w-5 text-niki-orange" />}
        />

        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => setSelectedLocationId(location.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                location.id === selectedLocationId
                  ? "bg-niki-orange text-white shadow-sm"
                  : "bg-niki-surface text-niki-ink/70 hover:bg-niki-navy/5",
              )}
            >
              {location.name}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-niki-surface p-4 text-sm text-niki-ink/70">
          <span className="flex items-center gap-1.5 font-semibold text-niki-ink">
            <MapPin className="h-4 w-4 text-niki-orange" />
            {selected.name}
          </span>
          <span className="flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4 text-niki-success" />
            {vendorMatches.length} vendors serving this area
          </span>
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-niki-orange" />
            {sameDayCount} same-day delivery picks
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-niki-navy" />
            {pickupCount} pickup-ready picks
          </span>
        </div>

        {vendorMatches.length > 0 ? (
          <div className="mt-7">
            <h3 className="mb-3 text-sm font-semibold text-niki-ink/70">
              Vendors serving {selected.name}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {vendorMatches.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} />
              ))}
            </div>
          </div>
        ) : null}

        {productMatches.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-semibold text-niki-ink/70">
              Products available for {selected.name}
            </h3>
            <ScrollRail>
              {productMatches.map((product) => (
                <RailItem key={product.id}>
                  <ProductCard product={product} vendorName={vendorNames?.[product.vendorId]} />
                </RailItem>
              ))}
            </ScrollRail>
          </div>
        ) : (
          <p className="mt-8 text-sm text-niki-ink/50">
            No vendors found for this location yet. Check back soon as NikiMart grows in your area.
          </p>
        )}
      </Container>
    </section>
  );
}
