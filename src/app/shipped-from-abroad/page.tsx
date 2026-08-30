import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Plane, Receipt, ShieldCheck, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAbroadOriginCounts, getAbroadProducts, getVendorNameMap } from "@/lib/catalog";
import { getAbroadConfig } from "@/lib/settings";
import { FOREIGN_COUNTRIES } from "@/lib/countries";

export const metadata: Metadata = {
  title: "Shipped from Abroad — Nickimart",
  description:
    "Order items sourced from suppliers in China, Dubai, the USA and Europe. Freight, duty and taxes are itemised before you pay, and you collect at your pickup point.",
};

/**
 * The Shipped from Abroad hub.
 *
 * It is a shop, not a brochure. The first version explained the three freight
 * legs, the arrival points, the payment plans and the tax treatment before a
 * single product appeared — everything true, and all of it in the way of the
 * one thing somebody came here to do. This one puts the goods first and keeps
 * the explanation to a single strip of three lines, with the detail a click
 * away on the policy page for anyone who wants it.
 *
 * The origin shortcuts are built from the catalogue rather than a fixed list,
 * so "Shop from China" only exists when there is something from China behind
 * it. A country card that leads to an empty page reads as a broken site.
 */
export default async function ShippedFromAbroadPage() {
  const [products, vendorNames, config, counts] = await Promise.all([
    getAbroadProducts(),
    getVendorNameMap(),
    getAbroadConfig(),
    getAbroadOriginCounts(),
  ]);

  const origins = FOREIGN_COUNTRIES.map((c) => ({ ...c, count: counts[c.code] ?? 0 })).filter(
    (c) => c.count > 0,
  );

  return (
    <>
      <PageHeader
        title={config.pageTitle}
        subtitle={config.pageIntro}
        crumbs={[{ label: config.pageTitle }]}
        tone="dark"
      />

      <Container className="py-8">
        {/* One strip, three facts. Everything else lives on the policy page. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact
            icon={Plane}
            title="Ordering never closes"
            body="No deadline. The seller sources it once you order, and shows an arrival estimate up front."
          />
          <Fact
            icon={Receipt}
            title="Every charge itemised"
            body="Freight, import duty and taxes are shown line by line at checkout, before you pay."
          />
          <Fact
            icon={Truck}
            title="Collect at your pickup point"
            body="We freight it in and hand it over at the Nickimart station you chose."
          />
        </div>

        {/* Origins, only where there is something behind them. */}
        {origins.length > 0 ? (
          <section className="mt-10">
            <SectionHeading
              title="Shop by origin"
              subtitle="Where these items are sourced from."
            />
            <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {origins.map((c) => (
                <Link
                  key={c.code}
                  href={`/shipped-from-abroad/${c.regionId}`}
                  className="niki-press group flex shrink-0 items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
                >
                  <span className="text-2xl" aria-hidden>
                    {c.flag}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-niki-ink">{c.name}</span>
                    <span className="block text-xs text-niki-ink/55">
                      {c.count} item{c.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-niki-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-niki-orange" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* The shop itself. */}
        <section className="mt-10">
          <SectionHeading
            title="All items shipped from abroad"
            subtitle={
              products.length > 0
                ? `${products.length} listing${products.length === 1 ? "" : "s"}, sourced on order.`
                : undefined
            }
          />
          {products.length > 0 ? (
            <ProductGrid products={products} vendorNames={vendorNames} />
          ) : (
            <EmptyState
              icon={<Plane className="h-6 w-6" />}
              title="Nothing here yet"
              message="Items sourced from abroad will appear here as sellers list them."
              actionLabel="Browse all products"
              actionHref="/products"
            />
          )}
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-niki-black p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-white/80">
            <ShieldCheck className="h-5 w-5 shrink-0 text-niki-orange" />
            Covered by Nickimart Buyer Protection, from the supplier&apos;s door to yours.
          </p>
          <Link
            href="/legal/preorder-policy"
            className="flex items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
          >
            How freight, duty and payment work
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </>
  );
}

function Fact({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Plane;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
      <p className="flex items-center gap-2 text-sm font-semibold text-niki-ink">
        <Icon className="h-4 w-4 shrink-0 text-niki-orange" />
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-niki-ink/60">{body}</p>
    </div>
  );
}
