import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MousePointerClick } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { OverviewRange } from "@/components/admin/OverviewRange";
import {
  CLICK_CHANNEL_OPTIONS,
  getAffiliateClicks,
  getAffiliateWindowTotals,
  getChannelMix,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { BarList } from "@/components/admin/charts/BarList";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";

export const metadata: Metadata = { title: "Links & clicks — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every visit through one of this affiliate's links.
 *
 * The click log is the half of the funnel the commission ledger cannot show.
 * "Forty clicks and no orders" is a different problem from "no clicks" — the
 * first is the wrong product or the wrong price, the second is the wrong
 * channel — and without this screen both look identical from the dashboard.
 */
export default async function AffiliateLinksPage({
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

  const channel = CLICK_CHANNEL_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, totals, channels] = await Promise.all([
    getAffiliateClicks(affiliate.id, { status: channel, q: query, page, perPage }),
    getAffiliateWindowTotals(affiliate.id, w),
    getChannelMix(affiliate.id, w, 8),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModuleHeader
          title="Links & clicks"
          subtitle="Who followed your links, and from where."
          icon={MousePointerClick}
        />
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={w.key}
            label={w.label}
            from={w.from}
            to={w.to}
            basePath="/affiliate/links"
          />
        </Suspense>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={`Clicks · ${w.label}`} value={totals.clicks.toLocaleString("en-GB")} />
        <StatCard label="Orders from them" value={totals.orders} href="/affiliate/orders" />
        <StatCard label="Conversion" value={`${totals.conversion}%`} />
        <StatCard label="Clicks logged all time" value={total.toLocaleString("en-GB")} />
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <h2 className="mb-3 font-display font-bold text-niki-ink">Where your clicks come from</h2>
        <BarList
          rows={channels}
          format={(v) => v.toLocaleString("en-GB")}
          empty="No clicks in this window yet. Share a product and they'll appear here."
        />
      </section>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by link code…"
            selects={[
              { key: "status", label: "Filter by channel", value: channel, options: CLICK_CHANNEL_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="clicks"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["When", "Product", "Link", "Channel", "Landed on"]}
        minWidth={880}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No clicks match these filters."
      >
        {rows.map((r) => (
          <ConsoleRow key={r.id}>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(r.createdAt)}
            </td>
            <td className={`${td} font-semibold text-niki-ink`}>
              {r.productSlug ? (
                <Link href={`/affiliate/shop/${r.productSlug}`} className="hover:text-niki-orange">
                  {r.productName}
                </Link>
              ) : (
                r.productName
              )}
            </td>
            <td className={`${td} font-mono text-xs font-semibold text-niki-orange`}>
              {r.linkCode || "—"}
            </td>
            <td className={td}>
              <ConsolePill status="paused" label={r.channelLabel} />
            </td>
            <td className={`${td} max-w-[280px] truncate font-mono text-[11px] text-niki-ink/45`}>
              {r.path || "—"}
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </div>
  );
}
