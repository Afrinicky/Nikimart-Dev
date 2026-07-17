import Link from "next/link";
import { ArrowRight, LayoutGrid, Sparkles, Store, Tag } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getCategories, getVendors } from "@/lib/catalog";
import { getLocations } from "@/lib/locations";
import { ICON_MAP } from "@/lib/icon-map";

export async function Hero() {
  const [categories, vendors, locations] = await Promise.all([
    getCategories(),
    getVendors(),
    getLocations(),
  ]);
  const sidebarCats = categories.slice(0, 12);

  return (
    <section className="bg-niki-surface pt-4">
      <Container className="grid gap-4 lg:grid-cols-[240px_1fr] lg:items-stretch">
        {/* Desktop category quick-nav — Jumia-style menu column. */}
        <aside className="hidden lg:block">
          <div className="h-full rounded-2xl bg-white p-2 ring-1 ring-black/5">
            <p className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-niki-ink">
              <LayoutGrid className="h-4 w-4 text-niki-orange" />
              All Categories
            </p>
            <ul>
              {sidebarCats.map((c) => {
                const Icon = ICON_MAP[c.icon] ?? Tag;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/categories/${c.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-niki-ink/80 transition-colors hover:bg-niki-surface hover:text-niki-orange"
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Hero banner. */}
        <div className="niki-gradient-hero relative overflow-hidden rounded-2xl">
          <div className="pointer-events-none absolute -left-16 top-6 h-56 w-56 rounded-full bg-niki-orange/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-niki-gold/15 blur-3xl" />

          <div className="relative px-5 py-5 sm:px-10 sm:py-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-niki-gold ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              Ghana&apos;s smartest growing marketplace
            </span>

            <h1 className="mt-3 max-w-xl text-balance font-display text-xl font-bold leading-snug text-white sm:text-4xl sm:leading-tight lg:text-[2.5rem]">
              Shop local, preorder global, and discover deals near you.
            </h1>

            <p className="mt-3 hidden max-w-md text-sm text-white/70 sm:block">
              Trusted local shops, preorder sellers, campus vendors, services, and official NikiMart
              products — all in one place.
            </p>

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

            <div className="mt-5 hidden flex-wrap items-center gap-x-8 gap-y-2 text-white/60 sm:flex">
              <div>
                <p className="font-display text-lg font-bold text-white">{vendors.length}+</p>
                <p className="text-[11px]">Trusted Vendors</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white">{categories.length}</p>
                <p className="text-[11px]">Categories</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white">{locations.length - 1}</p>
                <p className="text-[11px]">Campuses &amp; Communities</p>
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Mobile category strip — quick access, right under the banner. */}
      <Container className="mt-4 lg:hidden">
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
          {categories.map((c) => {
            const Icon = ICON_MAP[c.icon] ?? Tag;
            return (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-niki-orange ring-1 ring-black/5">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="line-clamp-2 text-[10px] font-medium leading-tight text-niki-ink">
                  {c.name}
                </span>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
