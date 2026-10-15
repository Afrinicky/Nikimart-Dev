import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Tags } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import {
  ConsolePill,
  ConsoleRow,
  ConsoleTable,
  formatWhen,
  td,
} from "@/components/affiliate/ConsoleTable";
import { CatalogueRowActions } from "@/components/affiliate/CatalogueRowActions";
import {
  BulkShareBar,
  SelectAll,
  SelectBox,
  SelectionProvider,
} from "@/components/affiliate/BulkShare";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  PROMOTED_STATUS_OPTIONS,
  affiliateStoreLink,
  getPromotedProducts,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { getAffiliateBranding } from "@/lib/affiliate-branding";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatMoney, formatPrice } from "@/lib/format";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "My products — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate's own list: what they chose to promote and how each link has
 * done.
 *
 * The important column is the one that is easy to miss — whether the product
 * still earns. A shop can withdraw a listing from the programme at any time,
 * and a list that kept advertising yesterday's commission would have somebody
 * posting a link that pays nothing. So eligibility is re-resolved on every
 * read and a row that has stopped earning says so, loudly, next to the link
 * that is still out there.
 */
export default async function AffiliateProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;

  const status = PROMOTED_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, branding] = await Promise.all([
    getPromotedProducts(affiliate.id, { status, q: query, page, perPage }),
    getAffiliateBranding(affiliate),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const linkBase = `${siteUrl()}/r`;

  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const commission = rows.reduce((s, r) => s + r.commission, 0);
  const stale = rows.filter((r) => !r.eligible).length;

  // What the bulk share carries for each row, from the same numbers the table
  // prints.
  const selectable = rows.map((r) => ({
    id: r.productId,
    name: r.name,
    price: formatPrice(r.price),
    oldPrice: null,
    discount: null,
    image: r.image,
    emoji: r.emoji,
    gradientFrom: "#f1f5f9",
    gradientTo: "#cbd5e1",
    shopName: r.shopName,
    categoryName: r.categoryName,
    linkCode: r.linkCode,
    eligible: r.eligible,
  }));

  return (
    <SelectionProvider>
      <ModuleHeader
        title="My products"
        subtitle="The products you promote, each with its own link and its own figures."
        icon={Tags}
      >
        <Link
          href="/affiliate/shop"
          className="niki-press rounded-lg bg-niki-orange px-4 py-2 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          Add more products
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Products on this page" value={rows.length} />
        <StatCard label="Clicks" value={clicks.toLocaleString("en-GB")} href="/affiliate/links" />
        <StatCard label="Commission" value={formatMoney(commission)} href="/affiliate/commissions" />
        <StatCard
          label="No longer earning"
          value={stale}
          href="/affiliate/products?status=ineligible"
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search your products or link codes…"
            selects={[
              { key: "status", label: "Filter by state", value: status, options: PROMOTED_STATUS_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="products"
          />
        </Suspense>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-niki-ink/55">
          Tick a few to send them all in one message.
        </p>
        <SelectAll products={selectable} />
      </div>

      <ConsoleTable
        columns={["", "Product", "Link", "Rate", "Clicks", "Orders", "Commission", "State", "Last shared", "Actions"]}
        minWidth={1180}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="You haven't added any products yet. Browse the catalogue and add the ones you'd recommend."
      >
        {rows.map((r) => (
          <ConsoleRow key={r.id}>
            <td className={`${td} w-10`}>
              <SelectBox product={selectable.find((p) => p.id === r.productId)!} />
            </td>
            <td className={td}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-niki-surface text-lg">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden>{r.emoji}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/affiliate/products/${r.productId}`}
                    className="line-clamp-2 max-w-[240px] font-semibold text-niki-ink hover:text-niki-orange"
                  >
                    {r.name}
                  </Link>
                  <p className="truncate text-[11px] text-niki-ink/45">
                    {r.shopName} · {formatPrice(r.price)}
                  </p>
                </div>
              </div>
            </td>
            <td className={`${td} font-mono text-xs font-semibold text-niki-orange`}>{r.linkCode}</td>
            <td className={td}>
              {r.eligible ? (
                <span className="font-semibold text-niki-ink">{r.rate}%</span>
              ) : (
                <span className="text-niki-ink/35">—</span>
              )}
            </td>
            <td className={`${td} font-semibold text-niki-ink`}>{r.clicks.toLocaleString("en-GB")}</td>
            <td className={`${td} text-niki-ink/70`}>{r.orders}</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(r.commission)}</td>
            <td className={td}>
              {!r.eligible ? (
                <ConsolePill
                  status="ineligible"
                  label="Not earning"
                  title="The shop has taken this one out of the affiliate programme."
                />
              ) : r.active ? (
                <ConsolePill status="live" label="Live" />
              ) : (
                <ConsolePill status="paused" label="Paused" />
              )}
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {r.lastSharedAt ? formatWhen(r.lastSharedAt) : "Not yet"}
            </td>
            <td className={td}>
              <CatalogueRowActions
                productId={r.productId}
                productName={r.name}
                price={r.price}
                shopName={r.shopName}
                linkCode={r.linkCode}
                selected
                eligible={r.eligible}
                shareMessage={r.shareMessage || affiliate.shareMessage}
                linkBase={linkBase}
                from="/affiliate/products"
                suspended={affiliate.status !== "active"}
              />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <BulkShareBar
        design={branding.design}
        watermark={branding.watermark}
        logoUrl={branding.logoUrl}
        linkBase={linkBase}
        caption={affiliate.shareMessage}
        storeLink={affiliateStoreLink(affiliate.code)}
        suspended={affiliate.status !== "active"}
      />
    </SelectionProvider>
  );
}
