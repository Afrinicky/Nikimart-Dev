import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Globe, PackageCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { sourceRegions } from "@/lib/global-data";

export const metadata: Metadata = {
  title: "Global Shopping — NikiMart",
};

export default function GlobalShoppingPage() {
  return (
    <>
      <PageHeader
        title="Shop the world. Pick up in Ghana."
        subtitle="Buy from Ghanaian shops and trusted sellers in China, Dubai, USA, and Europe — we handle payment, freight, customs, and pickup."
        crumbs={[{ label: "Global shopping" }]}
        tone="dark"
      />

      <Container className="py-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sourceRegions.map((region) => (
            <div
              key={region.id}
              className="group relative overflow-hidden rounded-3xl bg-white ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-niki-navy/10"
            >
              <div
                className="flex items-center gap-3 p-5 text-white"
                style={{
                  background: `linear-gradient(135deg, ${region.accentFrom} 0%, ${region.accentTo} 100%)`,
                }}
              >
                <span className="text-3xl">{region.flag}</span>
                <div>
                  <h3 className="font-display text-lg font-bold">Shop from {region.name}</h3>
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
                  href={region.id === "ghana" ? "/products" : "/buy-for-me"}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
                >
                  {region.id === "ghana" ? "Browse Ghana shops" : `Buy from ${region.name}`}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 rounded-3xl bg-niki-navy p-8 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
              <Globe className="h-6 w-6 text-niki-orange" />
              Can&apos;t find it? Paste any product link.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              If it&apos;s for sale anywhere online, our Buy-for-Me service can get it for you — with a
              full landed-cost quote before you pay.
            </p>
          </div>
          <Link
            href="/buy-for-me"
            className="flex items-center justify-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Buy For Me
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </>
  );
}
