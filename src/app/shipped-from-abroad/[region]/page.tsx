import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Plane } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAbroadProductsByCountry, getProductsByCountry, getVendorNameMap } from "@/lib/catalog";
import { countryByRegion, estimatedArrival } from "@/lib/countries";
import { getLeadDays } from "@/lib/settings";

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

export default async function AbroadRegionPage({ params }: { params: Params }) {
  const { region } = await params;
  const country = countryByRegion(region);
  if (!country) notFound();

  const [products, vendorNames, leadDays] = await Promise.all([
    // Ghana's page is the local catalogue; every other origin lists only what
    // is actually shipped from there.
    country.code === "GH"
      ? getProductsByCountry("GH")
      : getAbroadProductsByCountry(country.code),
    getVendorNameMap(),
    country.code === "GH" ? Promise.resolve(0) : getLeadDays(country.code),
  ]);
  const arrival = estimatedArrival(leadDays);

  return (
    <>
      <PageHeader
        title={`${country.flag} Shipped from ${country.name}`}
        subtitle={
          country.code === "GH"
            ? "Local shops and vendors near you."
            : `Sourced from suppliers in ${country.name} — estimated arrival in ~${leadDays} days. Freight, duty and taxes are itemised at checkout.`
        }
        crumbs={[{ label: "Shipped from Abroad", href: "/shipped-from-abroad" }, { label: country.name }]}
        tone="dark"
      />

      <Container className="py-8">
        <Link href="/shipped-from-abroad" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
          <ArrowLeft className="h-4 w-4" />
          All regions
        </Link>

        {country.code !== "GH" ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-niki-trust/10 p-4 text-sm ring-1 ring-niki-trust/20">
            <Plane className="h-5 w-5 shrink-0 text-niki-trust" />
            <p className="text-niki-ink/70">
              These are sourced once you order, and{" "}
              <span className="font-semibold text-niki-trust">shipped from abroad</span>. Ordering never
              closes. Estimated arrival around{" "}
              <span className="font-semibold text-niki-ink">
                {arrival.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              . They also appear in the general catalogue.
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          {products.length > 0 ? (
            <ProductGrid products={products} vendorNames={vendorNames} />
          ) : (
            <EmptyState
              icon={<Plane className="h-6 w-6" />}
              title={`Nothing from ${country.name} yet`}
              message={`Sellers shipping from ${country.name} will appear here. Check back soon.`}
              actionLabel="Browse all products"
              actionHref="/products"
            />
          )}
        </div>
      </Container>
    </>
  );
}
