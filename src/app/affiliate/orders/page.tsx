import type { Metadata } from "next";
import { Suspense } from "react";
import { ListOrdered } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatDay, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  REFERRED_ORDER_STATUS_OPTIONS,
  getAffiliateWindowTotals,
  getReferredOrders,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Referred orders — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every order this affiliate's links produced.
 *
 * Two statuses per row, because they answer different questions: the order's
 * tells them where the customer's parcel is, and the commission's tells them
 * where their money is. A single column would have to choose, and an affiliate
 * looking at "delivered" would reasonably expect to be paid — when in fact the
 * return window has a few days left to run.
 *
 * The buyer is a first name and an initial. An affiliate is owed an account of
 * what they earned, not a copy of somebody's customer record.
 */
export default async function AffiliateOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    per?: string;
    days?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;
  const w = resolveWindow(params);

  const status = REFERRED_ORDER_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, totals] = await Promise.all([
    getReferredOrders(affiliate.id, { status, q: query, page, perPage }),
    getAffiliateWindowTotals(affiliate.id, w),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <ModuleHeader
        title="Referred orders"
        subtitle="Orders placed by customers who arrived through your links."
        icon={ListOrdered}
      />

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders all time" value={total.toLocaleString("en-GB")} />
        <StatCard label={`Orders · ${w.label}`} value={totals.orders} />
        <StatCard label={`Sales · ${w.label}`} value={formatPrice(totals.sales)} />
        <StatCard
          label={`Commission · ${w.label}`}
          value={formatMoney(totals.commission)}
          href="/affiliate/commissions"
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by order number or product…"
            selects={[
              { key: "status", label: "Filter by order status", value: status, options: REFERRED_ORDER_STATUS_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="orders"
            exportHref="/affiliate/orders/export"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Order", "Date", "Buyer", "Products", "Order value", "Order status", "Your commission", "Commission status"]}
        minWidth={1180}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No referred orders yet. Share a product and the orders that follow appear here."
      >
        {rows.map((o) => (
          <ConsoleRow key={o.id}>
            <td className={`${td} font-mono text-xs font-semibold text-niki-ink`}>{o.orderNumber}</td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(o.createdAt)}
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>{o.buyer}</td>
            <td className={`${td} max-w-[260px] truncate text-xs text-niki-ink/65`} title={o.products}>
              {o.products}
            </td>
            <td className={`${td} font-semibold text-niki-ink`}>{formatPrice(o.subtotal)}</td>
            <td className={td}>
              <ConsolePill status={o.status} label={ORDER_STATUS_LABELS[o.status] ?? o.status} />
            </td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(o.commission)}</td>
            <td className={td}>
              <ConsolePill
                status={o.commissionStatus}
                label={COMMISSION_STATUS_LABELS[o.commissionStatus] ?? o.commissionStatus}
                title={
                  o.commissionStatus === "clearing" && o.holdUntil
                    ? `Clears on ${formatDay(o.holdUntil)}, once the return window closes.`
                    : undefined
                }
              />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </div>
  );
}
