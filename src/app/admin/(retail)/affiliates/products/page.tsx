import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { ProductEligibilityTool } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import { PRODUCT_ELIGIBILITY_OPTIONS, getProductEligibility } from "@/lib/affiliate-admin";
import { getCatalogueFacets } from "@/lib/affiliate-catalogue";
import { maxSellerFundedRate } from "@/lib/affiliate-commission";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Product eligibility — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Which products pay affiliates, and out of whose money.
 *
 * Two rules make this screen what it is. A seller can offer whatever they like
 * out of their own margin. Nickimart can enrol anything at its own expense,
 * but never more than half of the commission it earns on the item — so the
 * house always keeps at least half of what it makes. Both ceilings are printed
 * on the row, because an admin typing 40% against a 10%-commission item should
 * be told, not quietly corrected.
 */
export default async function AdminAffiliateProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = PRODUCT_ELIGIBILITY_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [facets, policy, { rows, total, enrolled }] = await Promise.all([
    getCatalogueFacets(),
    getAffiliatePolicy(),
    getProductEligibility({ status, category: params.category, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Product eligibility"
          subtitle={`${enrolled} of the catalogue pays commission. Sellers fund their own; Nickimart funds up to half of its commission on an item.`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Products shown" value={total.toLocaleString("en-GB")} />
        <StatCard
          label="In the programme"
          value={enrolled.toLocaleString("en-GB")}
          href="/admin/affiliates/products?status=enrolled"
        />
        <StatCard
          label="Being promoted"
          value={rows.filter((r) => r.promoters > 0).length}
          href="/admin/affiliates/products?status=promoted"
        />
        <StatCard label="Default rate" value={`${policy.defaultRate}%`} href="/admin/affiliates/settings" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search products…"
            selects={[
              { key: "status", label: "Filter by enrolment", value: status, options: PRODUCT_ELIGIBILITY_OPTIONS },
              {
                key: "category",
                label: "Filter by category",
                value: params.category ?? "all",
                options: facets.categories,
              },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="products"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Product",
          "Shop",
          "Price",
          "Platform cut",
          "Enrolment",
          "Rate",
          "Affiliate earns",
          "Promoters",
          "Paid out",
          "Actions",
        ]}
        minWidth={1340}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No products match these filters."
      >
        {rows.map((p) => (
          <ConsoleRow key={p.id}>
            <td className={td}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-niki-surface text-lg">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden>{p.emoji}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="line-clamp-2 max-w-[240px] font-semibold text-niki-ink hover:text-niki-orange"
                  >
                    {p.name}
                  </Link>
                  <p className="truncate text-[11px] text-niki-ink/45">{p.categoryName}</p>
                </div>
              </div>
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>{p.shopName}</td>
            <td className={`${td} font-semibold text-niki-ink`}>{formatPrice(p.price)}</td>
            <td className={`${td} text-xs text-niki-ink/60`}>
              {p.platformCommissionRate}%
              <span className="block text-[10px] text-niki-ink/40">
                we fund ≤ {p.platformCeiling}%
              </span>
            </td>
            <td className={td}>
              {!p.enabled ? (
                <ConsolePill status="paused" label="Not enrolled" />
              ) : p.enrolledBy === "admin" ? (
                <ConsolePill status="live" label="Nickimart funds" />
              ) : (
                <ConsolePill status="approved" label="Seller funds" />
              )}
            </td>
            <td className={td}>
              {p.rate > 0 ? (
                <span className="font-semibold text-niki-ink">
                  {p.rate}%
                  {p.ownRate !== null && p.ownRate !== p.rate ? (
                    <span className="ml-1 text-[10px] font-medium text-amber-700" title="Capped by the funding rule">
                      capped from {p.ownRate}%
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-niki-ink/35">—</span>
              )}
            </td>
            <td className={`${td} font-figures font-bold ${p.rate > 0 ? "text-niki-success" : "text-niki-ink/35"}`}>
              {p.rate > 0 ? `+${formatPrice(p.earnPerSale)}` : "—"}
            </td>
            <td className={`${td} text-niki-ink/70`}>{p.promoters}</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(p.commission)}</td>
            <td className={td}>
              <ProductEligibilityTool
                id={p.id}
                enabled={p.enabled}
                enrolledBy={p.enrolledBy}
                rate={p.ownRate}
                platformCeiling={p.platformCeiling}
                sellerCeiling={maxSellerFundedRate(p.platformCommissionRate)}
              />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs leading-relaxed text-niki-ink/50">
        A rate left blank inherits the category&apos;s affiliate rate, then the programme default of{" "}
        {policy.defaultRate}%. Category rates are set in{" "}
        <Link href="/admin/settings/categories" className="font-semibold text-niki-orange hover:underline">
          Categories
        </Link>
        , and a seller sets their own product&apos;s rate when they enrol it. Changing a rate here
        only affects sales made from now on — commission already earned is snapshotted.
      </p>
    </Container>
  );
}
