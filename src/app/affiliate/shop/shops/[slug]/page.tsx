import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, Store } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { CatalogueCard } from "@/components/affiliate/CatalogueCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { TablePager } from "@/components/admin/TablePager";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { prisma } from "@/lib/prisma";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import {
  CATALOGUE_ELIGIBILITY_OPTIONS,
  CATALOGUE_SORT_OPTIONS,
  getAffiliateCatalogue,
} from "@/lib/affiliate-catalogue";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await prisma.vendor
    .findUnique({ where: { slug }, select: { businessName: true } })
    .catch(() => null);
  return { title: `${shop?.businessName ?? "Shop"} — Affiliate — Nickimart` };
}

/**
 * One shop's storefront, seen as an affiliate.
 *
 * The shop's own branding, so an affiliate recognises where they are, over the
 * same cards the rest of the console uses. Promoting a shop's whole range is a
 * real pattern — one supplier, one commission rate, one set of flyers — and
 * this is where that is done.
 */
export default async function AffiliateShopStorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    eligibility?: string;
    sort?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { slug } = await params;
  const sp = await searchParams;

  const shop = await prisma.vendor
    .findUnique({
      where: { slug },
      select: {
        businessName: true,
        description: true,
        slug: true,
        logoUrl: true,
        bannerUrl: true,
        accentFrom: true,
        accentTo: true,
        initials: true,
        rating: true,
        reviewCount: true,
        verificationStatus: true,
      },
    })
    .catch(() => null);
  if (!shop || shop.verificationStatus !== "verified") notFound();

  const eligibility = CATALOGUE_ELIGIBILITY_OPTIONS.some((o) => o.value === sp.eligibility)
    ? sp.eligibility!
    : "all";
  const sort = CATALOGUE_SORT_OPTIONS.some((o) => o.value === sp.sort) ? sp.sort! : "earn";
  const query = (sp.q ?? "").trim();
  const perPage = perPageFrom(sp.per, 25);
  const page = Math.max(1, Number(sp.page) || 1);

  const result = await getAffiliateCatalogue(
    affiliate.id,
    { shop: slug, q: query, eligibility, sort },
    page,
    perPage,
  );
  const pageCount = Math.max(1, Math.ceil(result.total / perPage));

  // The shop's own totals, not the filtered page's.
  const all = await getAffiliateCatalogue(affiliate.id, { shop: slug }, 1, 100_000);
  const eligible = all.products.filter((p) => p.eligible);
  const best = eligible.reduce((max, p) => Math.max(max, p.earnPerSale), 0);

  return (
    <div>
      <Link
        href="/affiliate/shop/shops"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        All shops
      </Link>

      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white sm:p-6"
        style={{ background: `linear-gradient(135deg, ${shop.accentFrom}, ${shop.accentTo})` }}
      >
        {shop.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        ) : null}
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 font-display text-lg font-bold">
            {shop.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              shop.initials
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-figures text-2xl font-bold">{shop.businessName}</h1>
            <p className="line-clamp-2 text-sm text-white/80">{shop.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Listings" value={all.total} />
        <StatCard label="Earning commission" value={eligible.length} />
        <StatCard label="Best per sale" value={best > 0 ? `+${formatPrice(best)}` : "—"} />
        <StatCard label="On your list" value={all.products.filter((p) => p.selected).length} />
      </div>

      <ModuleHeader title="Products" subtitle={`Everything ${shop.businessName} is listing.`} icon={Store}>
        <Link
          href={`/shops/${shop.slug}`}
          className="niki-press inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          See the public shop
        </Link>
      </ModuleHeader>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder={`Search ${shop.businessName}…`}
            selects={[
              {
                key: "eligibility",
                label: "Filter by eligibility",
                value: eligibility,
                options: CATALOGUE_ELIGIBILITY_OPTIONS,
              },
              { key: "sort", label: "Sort", value: sort, options: CATALOGUE_SORT_OPTIONS },
            ]}
            shown={result.products.length}
            total={result.total}
            page={page}
            pageCount={pageCount}
            noun="products"
          />
        </Suspense>
      </div>

      {result.products.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-14 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
          No products match these filters.
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {result.products.map((p) => (
              <CatalogueCard
                key={p.id}
                product={{
                  id: p.id,
                  name: p.name,
                  slug: p.slug,
                  price: p.price,
                  oldPrice: p.oldPrice,
                  image: p.image,
                  emoji: p.emoji,
                  gradientFrom: p.gradientFrom,
                  gradientTo: p.gradientTo,
                  shopName: p.vendorName,
                  shopSlug: p.vendorSlug,
                  categoryName: p.categoryName,
                  eligible: p.eligible,
                  rate: p.rate,
                  earnPerSale: p.earnPerSale,
                  fundedBy: p.fundedBy,
                  reason: p.reason,
                  selected: p.selected,
                  linkCode: p.linkCode,
                }}
                shareMessage={affiliate.shareMessage}
                linkBase={`${siteUrl()}/r`}
                from={`/affiliate/shop/shops/${slug}`}
                suspended={affiliate.status !== "active"}
              />
            ))}
          </ul>

          <Suspense fallback={<div className="h-12" />}>
            <TablePager page={page} pageCount={pageCount} perPage={perPage} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
