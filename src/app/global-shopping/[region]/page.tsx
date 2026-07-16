import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Plane } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProductsByCountry, getVendorNameMap } from "@/lib/catalog";
import { countryByRegion, estimatedArrival } from "@/lib/countries";
import { getLeadDays } from "@/lib/settings";

type Params = Promise<{ region: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region } = await params;
  const country = countryByRegion(region);
  return { title: country ? `Shop from ${country.name} — NikiMart` : "Global Shopping — NikiMart" };
}

export default async function GlobalRegionPage({ params }: { params: Params }) {
  const { region } = await params;
  const country = countryByRegion(region);
  if (!country) notFound();

  const [products, vendorNames, leadDays] = await Promise.all([
    getProductsByCountry(country.code),
    getVendorNameMap(),
    country.code === "GH" ? Promise.resolve(0) : getLeadDays(country.code),
  ]);
  const arrival = estimatedArrival(leadDays);

  return (
    <>
      <PageHeader
        title={`${country.flag} Shop from ${country.name}`}
        subtitle={
          country.code === "GH"
            ? "Local shops and vendors near you."
            : `Imported items ship from ${country.name} — estimated arrival in ~${leadDays} days.`
        }
        crumbs={[{ label: "Global shopping", href: "/global-shopping" }, { label: country.name }]}
        tone="dark"
      />

      <Container className="py-8">
        <Link href="/global-shopping" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
          <ArrowLeft className="h-4 w-4" />
          All regions
        </Link>

        {country.code !== "GH" ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-niki-trust/10 p-4 text-sm ring-1 ring-niki-trust/20">
            <Plane className="h-5 w-5 shrink-0 text-niki-trust" />
            <p className="text-niki-ink/70">
              These items are <span className="font-semibold text-niki-trust">shipped from abroad</span>. Order now for
              estimated arrival around{" "}
              <span className="font-semibold text-niki-ink">
                {arrival.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              . They also appear in the general catalog.
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          {products.length > 0 ? (
            <ProductGrid products={products} vendorNames={vendorNames} />
          ) : (
            <EmptyState
              icon={<Plane className="h-6 w-6" />}
              title={`No ${country.name} products yet`}
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
