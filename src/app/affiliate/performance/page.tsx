import type { Metadata } from "next";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  ConsoleRow,
  ConsoleTable,
  formatDay,
  td,
} from "@/components/affiliate/ConsoleTable";
import {
  getAffiliatePreviousTotals,
  getAffiliateSeries,
  getAffiliateWindowTotals,
  getChannelMix,
  getReferredStatusMix,
  getTopProducts,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Performance — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

const STATUS_COLOUR: Record<string, string> = {
  delivered: "#059669",
  shipped: "#0284c7",
  paid: "#ff6a00",
  cancelled: "#dc2626",
};

/**
 * The whole funnel in one place: clicks, orders, sales, commission.
 *
 * The dashboard answers "how am I doing"; this answers "why". Four charts over
 * the same window, and the window's own figures against the window before it,
 * because an affiliate deciding what to post next week needs to see which
 * products and which channels actually converted — not just that the total
 * went up.
 */
export default async function AffiliatePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const params = await searchParams;
  const w = resolveWindow(params);

  const [totals, previous, series, top, channels, statusMix] = await Promise.all([
    getAffiliateWindowTotals(affiliate.id, w),
    getAffiliatePreviousTotals(affiliate.id, w),
    getAffiliateSeries(affiliate.id, w),
    getTopProducts(affiliate.id, w, 10),
    getChannelMix(affiliate.id, w, 10),
    getReferredStatusMix(affiliate.id, w),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModuleHeader
          title="Performance"
          subtitle={`Clicks, orders and commission across the ${w.label}.`}
          icon={BarChart3}
        />
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={w.key}
            label={w.label}
            from={w.from}
            to={w.to}
            basePath="/affiliate/performance"
          />
        </Suspense>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Clicks" value={totals.clicks.toLocaleString("en-GB")} />
        <StatCard label="Orders" value={totals.orders.toLocaleString("en-GB")} />
        <StatCard label="Conversion" value={`${totals.conversion}%`} />
        <StatCard label="Sales referred" value={formatPrice(totals.sales)} />
        <StatCard label="Commission" value={formatMoney(totals.commission)} />
      </div>

      {previous ? (
        <p className="mt-3 text-xs text-niki-ink/55">
          Against the {w.days} days before: {delta(totals.clicks, previous.clicks)} clicks,{" "}
          {delta(totals.orders, previous.orders)} orders,{" "}
          {delta(totals.commission, previous.commission)} commission.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-1 font-display font-bold text-niki-ink">Commission</h2>
          <p className="mb-3 text-xs text-niki-ink/55">What your links earned, over the window.</p>
          {series.length > 0 ? (
            <TrendChart
              points={series.map((p) => ({
                day: p.day,
                endDay: p.endDay,
                value: p.commission,
                label: formatMoney(p.commission),
                count: p.orders,
              }))}
              countLabel="orders"
            />
          ) : (
            <Empty />
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-1 font-display font-bold text-niki-ink">Clicks</h2>
          <p className="mb-3 text-xs text-niki-ink/55">
            How much traffic your shares sent, over the window.
          </p>
          {series.length > 0 ? (
            <TrendChart
              points={series.map((p) => ({
                day: p.day,
                endDay: p.endDay,
                value: p.clicks,
                label: p.clicks.toLocaleString("en-GB"),
                count: p.orders,
              }))}
              countLabel="orders"
            />
          ) : (
            <Empty />
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-3 font-display font-bold text-niki-ink">Where clicks come from</h2>
          <BarList
            rows={channels}
            format={(v) => v.toLocaleString("en-GB")}
            empty="No clicks in this window."
          />
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-3 font-display font-bold text-niki-ink">Where your orders got to</h2>
          <StatusBar
            slices={["delivered", "shipped", "paid", "cancelled"].map((status) => ({
              key: status,
              label: ORDER_STATUS_LABELS[status] ?? status,
              count: statusMix[status] ?? 0,
              colour: STATUS_COLOUR[status],
              href: `/affiliate/orders?status=${status}`,
            }))}
          />
        </section>
      </div>

      <h2 className="mt-7 font-display text-lg font-bold text-niki-ink">Your best products</h2>
      <p className="mt-0.5 text-sm text-niki-ink/60">
        What earned you the most over the {w.label}.
      </p>
      <ConsoleTable
        columns={["#", "Product", "Sales", "Commission"]}
        minWidth={640}
        page={1}
        pageCount={1}
        perPage={10}
        empty="No sales in this window yet."
      >
        {top.map((row, i) => (
          <ConsoleRow key={row.key}>
            <td className={`${td} w-10 font-figures font-bold text-niki-ink/35`}>{i + 1}</td>
            <td className={`${td} font-semibold text-niki-ink`}>{row.label}</td>
            <td className={`${td} text-niki-ink/70`}>{row.note ?? "—"}</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(row.value)}</td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs text-niki-ink/45">
        Figures cover {w.start ? `${formatDay(w.start)} onwards` : "every record we hold"}.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
      Nothing to plot yet.
    </p>
  );
}

/** "up 24%" / "down 8%" / "level", as words rather than an arrow. */
function delta(now: number, before: number): string {
  if (before === 0) return now === 0 ? "level" : "up from nothing";
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return "level";
  return `${change > 0 ? "up" : "down"} ${Math.abs(change)}%`;
}
