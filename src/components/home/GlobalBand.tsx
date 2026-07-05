import Link from "next/link";
import { ArrowRight, Globe, Link2, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { sourceRegions } from "@/lib/global-data";

export function GlobalBand() {
  return (
    <section className="bg-niki-navy py-12 sm:py-14">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-niki-gold ring-1 ring-white/15">
              <Globe className="h-3.5 w-3.5" />
              Global shopping
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">
              Shop the world. Pick up in Ghana.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              Buy from local shops and trusted sellers abroad. We handle payment, freight, customs,
              and delivery to your pickup point.
            </p>
          </div>
          <Link
            href="/how-it-works"
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10"
          >
            How it works
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {sourceRegions.map((region) => (
            <Link
              key={region.id}
              href={region.id === "ghana" ? "/products" : "/global-shopping"}
              className="group rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition-colors hover:bg-white/10"
            >
              <span className="text-3xl">{region.flag}</span>
              <p className="mt-2 font-display text-sm font-bold text-white">Shop from {region.name}</p>
              <p className="mt-0.5 text-xs text-white/50">{region.deliveryEstimate}</p>
            </Link>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/buy-for-me"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Link2 className="h-4 w-4" />
            Paste a product link
          </Link>
          <Link
            href="/pickup-points"
            className="flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
          >
            <Truck className="h-4 w-4" />
            Find a pickup point
          </Link>
        </div>
      </Container>
    </section>
  );
}
