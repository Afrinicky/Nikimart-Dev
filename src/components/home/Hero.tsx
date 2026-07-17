import Link from "next/link";
import { ArrowRight, Clock3, GraduationCap, Sparkles, Store, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SearchBar } from "@/components/layout/SearchBar";
import { getCategories, getVendors } from "@/lib/catalog";
import { getLocations } from "@/lib/locations";

const DEAL_CARDS = [
  {
    icon: Zap,
    title: "Flash Sales",
    description: "Up to 40% off today",
    accent: "from-niki-orange to-niki-gold",
  },
  {
    icon: Clock3,
    title: "Preorder Deals",
    description: "Imported items, deposit from 30%",
    accent: "from-niki-navy-soft to-niki-orange",
  },
  {
    icon: GraduationCap,
    title: "Campus Delivery",
    description: "Same-day drop-off near your hostel",
    accent: "from-niki-success to-niki-navy-soft",
  },
];

export async function Hero() {
  const [categories, vendors, locations] = await Promise.all([
    getCategories(),
    getVendors(),
    getLocations(),
  ]);
  return (
    <section className="niki-gradient-hero relative overflow-hidden">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-niki-orange/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-niki-gold/15 blur-3xl" />

      <Container className="relative grid gap-8 py-9 sm:py-12 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-niki-gold ring-1 ring-white/15">
            <Sparkles className="h-3.5 w-3.5" />
            Ghana&apos;s smartest growing marketplace
          </span>

          <h1 className="mt-4 max-w-xl text-balance font-display text-2xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            Shop local, preorder global, and discover deals near you.
          </h1>

          {/* Prominent search — the primary way ordinary/mobile users find things.
              Hidden on lg where the header already carries a search bar. */}
          <SearchBar className="mt-5 max-w-lg lg:hidden" />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/products"
              className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-niki-orange/30 transition-colors hover:bg-niki-orange-light"
            >
              Shop Now
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sell"
              className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-niki-navy transition-colors hover:bg-white/90"
            >
              <Store className="h-4 w-4" />
              Sell on NikiMart
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-white/60">
            <div>
              <p className="font-display text-xl font-bold text-white">{vendors.length}+</p>
              <p className="text-xs">Trusted Vendors</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-white">{categories.length}</p>
              <p className="text-xs">Categories</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-white">{locations.length - 1}</p>
              <p className="text-xs">Campuses &amp; Communities</p>
            </div>
          </div>
        </div>

        {/* Decorative promo cards — desktop only; on mobile the real product
            rails sit immediately below, so we keep the hero short. */}
        <div className="hidden flex-col gap-4 lg:flex">
          {DEAL_CARDS.map(({ icon: Icon, title, description, accent }) => (
            <div
              key={title}
              className="niki-glow flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm ring-1 ring-white/10 transition-transform hover:-translate-y-1"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <p className="font-display text-sm font-bold text-white">{title}</p>
                <p className="text-xs text-white/60">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
