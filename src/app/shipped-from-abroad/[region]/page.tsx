import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Plane } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAbroadOriginCounts,
  getAbroadProductsByCountry,
  getProductsByCountry,
  getVendorNameMap,
} from "@/lib/catalog";
import { countryByRegion, estimatedArrival, FOREIGN_COUNTRIES } from "@/lib/countries";
import { getLeadDays } from "@/lib/shipping-config";

type Params = Promise<{ region: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region } = await params;
  const country = countryByRegion(region);
  return {
    title: country
      ? `Shipped from ${country.name} — Nickimart`
      : "Shipped from Abroad — Nickimart",
  };
}

/**
 * One origin's listings.
 *
 * The origin switcher along the top is built from the catalogue's own counts,
 * so a reader who lands on an empty origin can see at a glance which ones have
 * anything — better than a dead end and a "check back soon".
 */
export default async function AbroadRegionPage({ params }: { params: Params }) {
  const { region } = await params;
  const country = countryByRegion(region);
  if (!country) notFound();

  const local = country.code === "GH";
  const [products, vendorNames, leadDays, counts] = await Promise.all([
    // Ghana's page is the local catalogue; every other origin lists only what
    // is actually shipped from there.
    local ? getProductsByCountry("GH") : getAbroadProductsByCountry(country.code),
    getVendorNameMap(),
    local ? Promise.resolve(0) : getLeadDays(country.code),
    getAbroadOriginCounts(),
  ]);
  const arrival = estimatedArrival(leadDays);
  const others = FOREIGN_COUNTRIES.map((c) => ({ ...c, count: counts[c.code] ?? 0 })).filter(
    (c) => c.count > 0,
  );

  return (
    <>
      <PageHeader
        title={`${country.flag} Shipped from ${country.name}`}
        subtitle={
          local
            ? "Local shops and vendors near you."
            : `Sourced on order — estimated arrival around ${arrival.toLocaleDateString("en-GH", { day: "numeric", month: "long" })}. Freight, duty and taxes are itemised at checkout.`
        }
        crumbs={[{ label: "Shipped from Abroad", href: "/shipped-from-abroad" }, { label: country.name }]}
        tone="dark"
      />

      <Container className="py-8">
        <Link
          href="/shipped-from-abroad"
          className="flex w-fit items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          All origins
        </Link>

        {others.length > 1 ? (
          <div className="scrollbar-none -mx-1 mt-4 flex gap-2 overflow-x-auto px-1">
            {others.map((c) => {
              const active = c.code === country.code;
              return (
                <Link
                  key={c.code}
                  href={`/shipped-from-abroad/${c.regionId}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "niki-chip-active bg-niki-black text-white"
                      : "niki-chip text-niki-ink/75 hover:text-niki-ink"
                  }`}
                >
                  <span aria-hidden>{c.flag}</span>
                  {c.name}
                  <span className={active ? "text-white/55" : "text-niki-ink/40"}>{c.count}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        <div className="mt-6">
          {products.length > 0 ? (
            <ProductGrid products={products} vendorNames={vendorNames} />
          ) : (
            <EmptyState
              icon={<Plane className="h-6 w-6" />}
              title={`Nothing from ${country.name} yet`}
              message={
                others.length > 0
                  ? "Try another origin above, or browse everything shipped from abroad."
                  : `Sellers shipping from ${country.name} will appear here. Check back soon.`
              }
              actionLabel="All items shipped from abroad"
              actionHref="/shipped-from-abroad"
            />
          )}
        </div>
      </Container>
    </>
  );
}
