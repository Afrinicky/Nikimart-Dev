import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Anchor, Globe, PackageCheck, Plane, Receipt, Truck, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { sourceRegions } from "@/lib/global-data";
import { getAbroadProducts, getVendorNameMap } from "@/lib/catalog";
import { getAbroadConfig } from "@/lib/settings";
import { getActiveArrivalPoints } from "@/lib/arrival-points-data";

export const metadata: Metadata = {
  title: "Shipped from Abroad — Nickimart",
  description:
    "Order items sourced from suppliers in China, Dubai, the USA and Europe. Freight, duty and taxes are itemised before you pay, and you collect at your pickup point.",
};

/**
 * The Shipped from Abroad hub — the merge of the old Preorder Deals page and
 * the old Global Shopping page.
 *
 * Those two were describing the same transaction from two angles: one listed
 * the items, the other explained the journey, and neither told a buyer what the
 * thing would actually cost to land. This page is both halves plus that answer:
 * how the three freight legs work, where consignments clear, and every listing
 * currently on offer. The regions still route to their own pages, because
 * "everything from China" is a real way to shop.
 */
export default async function ShippedFromAbroadPage() {
  const [products, vendorNames, config, points] = await Promise.all([
    getAbroadProducts(),
    getVendorNameMap(),
    getAbroadConfig(),
    getActiveArrivalPoints(),
  ]);

  return (
    <>
      <PageHeader
        title={config.pageTitle}
        subtitle={config.pageIntro}
        crumbs={[{ label: config.pageTitle }]}
        tone="dark"
      />

      <Container className="py-10">
        {/* How the money and the journey work. This is the part buyers get
            wrong: they expect a price and meet a landed cost. */}
        <section className="rounded-3xl bg-niki-black p-6 text-white sm:p-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Globe className="h-5 w-5 text-niki-orange" />
            Three legs, one bill, no surprises
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/70">
            Your item is bought abroad and travels to you in three stages. Every stage is priced
            separately at checkout, alongside the tax charged where it was bought and the duty
            charged when it lands, so you see the whole bill before you pay a pesewa of it.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            <Leg
              n={1}
              icon={Truck}
              title="Supplier to forwarder"
              body="The seller buys it from their supplier and gets it to a freight forwarder abroad."
            />
            <Leg
              n={2}
              icon={Plane}
              title="Forwarder to Ghana"
              body="By air or by sea, into a Ghana arrival point. Import duty and clearing are settled here."
            />
            <Leg
              n={3}
              icon={PackageCheck}
              title="Arrival point to you"
              body="From where it lands to the Nickimart pickup station you chose. You're alerted at every step."
            />
          </ol>

          <div className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
            <Note
              icon={Wallet}
              title="Pay it all, or pay what's already spent"
              body="Where the seller allows it, you can settle the goods now and the freight and duty when the item reaches Ghana — at the rates in force then."
            />
            <Note
              icon={Receipt}
              title="Ordering never closes"
              body="Unlike a preorder, there's no deadline. Order whenever you like; the seller sources it and the arrival estimate is shown up front."
            />
          </div>
        </section>

        {/* Where consignments land. Real, admin-configured points — this is the
            thing a buyer cannot find out anywhere else. */}
        {points.length > 0 ? (
          <section className="mt-10">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
              <Anchor className="h-5 w-5 text-niki-orange" />
              Where consignments land in Ghana
            </h2>
            <p className="mt-1 text-sm text-niki-ink/60">
              Each seller picks the point their goods clear through. The point sets the freight rate
              into Ghana and the leg from there to your pickup station.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {points.map((p) => (
                <div key={p.id} className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
                  <p className="font-semibold text-niki-ink">{p.name}</p>
                  {p.city ? <p className="text-sm text-niki-ink/60">{p.city}</p> : null}
                  <p className="mt-2 text-xs text-niki-ink/50">
                    Import duty {p.dutyPercent}%
                    {p.clearingFee > 0 ? ` · clearing GH₵${p.clearingFee.toFixed(2)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Browse by origin. */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-niki-ink">Shop by origin</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sourceRegions.map((region) => (
              <div
                key={region.id}
                className="group relative overflow-hidden rounded-3xl bg-white ring-1 ring-niki-edge transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-black/10"
              >
                <div
                  className="flex items-center gap-3 p-5 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${region.accentFrom} 0%, ${region.accentTo} 100%)`,
                  }}
                >
                  <span className="text-3xl">{region.flag}</span>
                  <div>
                    <h3 className="font-display text-lg font-bold">
                      {region.id === "ghana" ? "Ghana shops" : `Shipped from ${region.name}`}
                    </h3>
                    <p className="text-xs text-white/80">{region.tagline}</p>
                  </div>
                </div>
                <div className="p-5">
                  <ul className="space-y-1.5">
                    {region.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2 text-sm text-niki-ink/70">
                        <PackageCheck className="h-4 w-4 shrink-0 text-niki-success" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs font-medium text-niki-ink/50">
                    Est. delivery: {region.deliveryEstimate}
                  </p>
                  <Link
                    href={region.id === "ghana" ? "/products" : `/shipped-from-abroad/${region.id}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
                  >
                    {region.id === "ghana" ? "Browse Ghana shops" : `Shop from ${region.name}`}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Everything on offer. */}
        <section className="mt-12">
          <h2 className="font-display text-lg font-bold text-niki-ink">
            Everything shipped from abroad
          </h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            {products.length > 0
              ? `${products.length} listing${products.length === 1 ? "" : "s"} sourced on order. They also appear in the general catalogue.`
              : "Sellers list items here as they set up their supplier links."}
          </p>
          <div className="mt-4">
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
          </div>
        </section>
      </Container>
    </>
  );
}

function Leg({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: number;
  icon: typeof Plane;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-niki-orange font-figures text-sm font-bold text-white">
          {n}
        </span>
        <Icon className="h-4 w-4 text-niki-orange" />
      </div>
      <p className="mt-3 font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm text-white/65">{body}</p>
    </li>
  );
}

function Note({ icon: Icon, title, body }: { icon: typeof Plane; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-niki-orange" />
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/65">{body}</p>
      </div>
    </div>
  );
}
