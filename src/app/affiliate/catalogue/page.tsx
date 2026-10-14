import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import {
  ConsolePill,
  ConsoleRow,
  ConsoleTable,
  td,
} from "@/components/affiliate/ConsoleTable";
import { CatalogueRowActions } from "@/components/affiliate/CatalogueRowActions";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import {
  CATALOGUE_ELIGIBILITY_OPTIONS,
  CATALOGUE_SORT_OPTIONS,
  getAffiliateCatalogue,
  getCatalogueFacets,
} from "@/lib/affiliate-catalogue";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Catalogue — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every active product on Nickimart, as a table.
 *
 * The grid view next door is for browsing; this is for deciding. One row per
 * listing, sorted by what a sale actually pays, with the commission, who funds
 * it and whether it is in the programme at all in columns you can scan — which
 * is the question somebody opens this screen with: what is worth posting
 * today.
 *
 * Products that pay nothing are here too, and say so. The old list showed
 * enrolled products alone, which meant an affiliate searching for something a
 * customer had asked about got an empty result and no idea whether the item
 * exists, whether it pays, or who to ask.
 */
export default async function AffiliateCataloguePage({
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

  const [facets, result] = await Promise.all([
    getCatalogueFacets(),
    getAffiliateCatalogue(
      affiliate.id,
      {
        q: query,
        category: params.category,
        shop: params.shop,
        eligibility,
        sort,
      },
      page,
      perPage,
    ),
  ]);

  const pageCount = Math.max(1, Math.ceil(result.total / perPage));
  const linkBase = `${siteUrl()}/r`;
  const defaultMessage = affiliate.shareMessage;

  return (
    <div>
      <ModuleHeader
        title="Catalogue"
        subtitle="Every product on Nickimart, with what each one pays you."
        icon={Gift}
      >
        <Link
          href="/affiliate/shop"
          className="niki-press rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          Browse as a shopper
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Products listed" value={result.total.toLocaleString("en-GB")} />
        <StatCard
          label="Earning commission"
          value={result.eligibleTotal.toLocaleString("en-GB")}
          href="/affiliate/catalogue?eligibility=eligible"
        />
        <StatCard
          label="On my list"
          value={result.selectedTotal.toLocaleString("en-GB")}
          href="/affiliate/products"
        />
        <StatCard
          label="Your rate"
          value={affiliate.commissionRate ? `${affiliate.commissionRate}% floor` : "Per product"}
        />
      </div>

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

      <ConsoleTable
        columns={["Product", "Shop", "Category", "Price", "Commission", "You earn", "Funded by", "Actions"]}
        minWidth={1120}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No products match these filters. Try clearing the search or widening the category."
      >
        {result.products.map((p) => (
          <ConsoleRow key={p.id}>
            <td className={td}>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-niki-surface text-lg"
                  style={{
                    background: p.image
                      ? undefined
                      : `linear-gradient(135deg, ${p.gradientFrom}, ${p.gradientTo})`,
                  }}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden>{p.emoji}</span>
                  )}
                </span>
                <Link
                  href={`/affiliate/shop/${p.slug}`}
                  className="line-clamp-2 max-w-[260px] font-semibold text-niki-ink hover:text-niki-orange"
                >
                  {p.name}
                </Link>
              </div>
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>
              <Link href={`/affiliate/shop/shops/${p.vendorSlug}`} className="hover:text-niki-orange">
                {p.vendorName}
              </Link>
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>{p.categoryName}</td>
            <td className={`${td} font-semibold text-niki-ink`}>{formatPrice(p.price)}</td>
            <td className={td}>
              {p.eligible ? (
                <ConsolePill
                  status="live"
                  label={`${p.rate}%`}
                  title={`Rate set by the ${p.rateSource === "default" ? "programme default" : p.rateSource}`}
                />
              ) : (
                <ConsolePill status="ineligible" label="None" title={p.reason} />
              )}
            </td>
            <td className={`${td} font-figures font-bold ${p.eligible ? "text-niki-success" : "text-niki-ink/35"}`}>
              {p.eligible ? `+${formatPrice(p.earnPerSale)}` : "—"}
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>
              {p.fundedBy === "platform" ? "Nickimart" : p.fundedBy === "seller" ? "The shop" : "—"}
            </td>
            <td className={td}>
              <CatalogueRowActions
                productId={p.id}
                productName={p.name}
                price={p.price}
                shopName={p.vendorName}
                linkCode={p.linkCode}
                selected={p.selected}
                eligible={p.eligible}
                shareMessage={defaultMessage}
                linkBase={linkBase}
                from="/affiliate/catalogue"
                suspended={affiliate.status !== "active"}
              />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </div>
  );
}
