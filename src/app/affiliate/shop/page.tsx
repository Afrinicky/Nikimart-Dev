import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ShoppingBag, Store } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { CatalogueCard } from "@/components/affiliate/CatalogueCard";
import { BulkShareBar, SelectAll, SelectionProvider } from "@/components/affiliate/BulkShare";
import { TablePager } from "@/components/admin/TablePager";
import { affiliateStoreLink, requireAffiliateConsole } from "@/lib/affiliate-console";
import {
  CATALOGUE_ELIGIBILITY_OPTIONS,
  CATALOGUE_SORT_OPTIONS,
  getAffiliateCatalogue,
  getCatalogueFacets,
  toSelectable,
} from "@/lib/affiliate-catalogue";
import { getAffiliateBranding } from "@/lib/affiliate-branding";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Browse products — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The storefront, seen as an affiliate.
 *
 * The same shelves a shopper browses, with one difference that changes
 * everything: each card says what the product pays and lets you act on it
 * there and then. Before this, an affiliate browsing the real storefront had
 * to note down what they liked, go to the console, and find it again — so the
 * products they shared were the ones they could remember, not the ones worth
 * sharing.
 *
 * Products that earn nothing are shown too, marked. An affiliate asked for
 * something specific by a customer needs to know whether it exists before they
 * need to know whether it pays.
 */
export default async function AffiliateShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    shop?: string;
    eligibility?: string;
    sort?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;

  const eligibility = CATALOGUE_ELIGIBILITY_OPTIONS.some((o) => o.value === params.eligibility)
    ? params.eligibility!
    : "all";
  const sort = CATALOGUE_SORT_OPTIONS.some((o) => o.value === params.sort) ? params.sort! : "earn";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [facets, branding, result] = await Promise.all([
    getCatalogueFacets(),
    getAffiliateBranding(affiliate),
    getAffiliateCatalogue(
      affiliate.id,
      { q: query, category: params.category, shop: params.shop, eligibility, sort },
      page,
      perPage,
    ),
  ]);
  const pageCount = Math.max(1, Math.ceil(result.total / perPage));

  const selectable = result.products.map(toSelectable);

  return (
    <SelectionProvider>
      <ModuleHeader
        title="Browse products"
        subtitle="The Nickimart storefront, with what each product pays you."
        icon={ShoppingBag}
      >
        <Link
          href="/affiliate/shop/shops"
          className="niki-press inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <Store className="h-3.5 w-3.5" />
          Browse by shop
        </Link>
        <Link
          href="/affiliate/catalogue"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          See as a table
        </Link>
      </ModuleHeader>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search products, shops, categories…"
            selects={[
              {
                key: "eligibility",
                label: "Filter by eligibility",
                value: eligibility,
                options: CATALOGUE_ELIGIBILITY_OPTIONS,
              },
              {
                key: "category",
                label: "Filter by category",
                value: params.category ?? "all",
                options: facets.categories,
              },
              {
                key: "shop",
                label: "Filter by shop",
                value: params.shop ?? "all",
                options: facets.shops,
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-niki-ink/55">
              Tick a few and share them together — each one gets its own link.
            </p>
            <SelectAll products={selectable} />
          </div>

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
                from="/affiliate/shop"
                suspended={affiliate.status !== "active"}
              />
            ))}
          </ul>

          <Suspense fallback={<div className="h-12" />}>
            <TablePager page={page} pageCount={pageCount} perPage={perPage} />
          </Suspense>
        </div>
      )}

      <BulkShareBar
        design={branding.design}
        watermark={branding.watermark}
        logoUrl={branding.logoUrl}
        linkBase={`${siteUrl()}/r`}
        caption={affiliate.shareMessage}
        storeLink={affiliateStoreLink(affiliate.code)}
        suspended={affiliate.status !== "active"}
      />
    </SelectionProvider>
  );
}
