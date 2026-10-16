import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  MousePointerClick,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { ShareLinkCard } from "@/components/affiliate/ShareLinkCard";
import { formatMoney, formatPrice } from "@/lib/format";
import { getAffiliatePitch } from "@/lib/settings";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import {
  affiliateStoreLink,
  getAffiliateBalance,
  getAffiliatePreviousTotals,
  getAffiliateSeries,
  getAffiliateWindowTotals,
  getChannelMix,
  getPromotedProducts,
  getReferredStatusMix,
  getTopProducts,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { getFollowUps } from "@/lib/affiliate-assist";
import { FollowUpList } from "@/components/affiliate/FollowUpList";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate's dashboard.
 *
 * Console only. The pitch and the application live at `/become-an-affiliate`,
 * outside the console — a marketing page wants the shop's header and footer
 * around it, and a workspace with a sidebar that owns the window does not.
 */
export default async function AffiliatePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const pitch = await getAffiliatePitch();

  return <Dashboard affiliate={affiliate} pitch={pitch} searchParams={await searchParams} />;
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

/** The reserved status colours, a step darker than the text tokens — a fill
 *  under 3:1 against white is not readable as a segment. */
const STATUS_COLOUR: Record<string, string> = {
  delivered: "#059669",
  shipped: "#0284c7",
  paid: "#ff6a00",
  cancelled: "#dc2626",
  pending: "#6b7280",
};

async function Dashboard({
  affiliate,
  pitch,
  searchParams,
}: {
  affiliate: { id: string; name: string; code: string; status: string; shareMessage: string };
  pitch: string;
  searchParams: { days?: string; from?: string; to?: string };
}) {
  // The month is the window these screens open on: commission is reconciled by
  // the month, and a rolling thirty days straddles two of them.
  const w = resolveWindow(searchParams, new Date(), { fallback: "month" });

  const [totals, previous, series, balance, top, channels, statusMix, promoted, board] =
    await Promise.all([
      getAffiliateWindowTotals(affiliate.id, w),
      getAffiliatePreviousTotals(affiliate.id, w),
      getAffiliateSeries(affiliate.id, w),
      getAffiliateBalance(affiliate.id),
      getTopProducts(affiliate.id, w),
      getChannelMix(affiliate.id, w),
      getReferredStatusMix(affiliate.id, w),
      getPromotedProducts(affiliate.id, { perPage: 1 }),
      getFollowUps(affiliate.id),
    ]);

  const range = `?${new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">
            Welcome back, {affiliate.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Your links, your sales and what you&apos;re owed — over the {w.label}.
          </p>
        </div>
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={w.key}
            label={w.label}
            from={w.from}
            to={w.to}
            basePath="/affiliate"
          />
        </Suspense>
      </div>

      {/* Nothing shared yet is the one state a dashboard cannot answer, so it
          gets its own screen rather than six zeroes. */}
      {promoted.total === 0 ? (
        <div className="animate-fade-up rounded-2xl bg-niki-black p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-niki-orange">
            <Sparkles className="h-5 w-5" />
            <span className="font-display font-bold">Start with one product</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-white/70">
            {pitch} Browse the catalogue, add anything you&apos;d recommend to your list, and the
            console builds you a flyer, a caption and your own link for it.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionLink
              href="/affiliate/shop"
              className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
            >
              Browse products
            </ActionLink>
            <ActionLink
              href="/affiliate/catalogue"
              className="rounded-full px-5 py-2.5 text-sm font-bold text-white/80 ring-1 ring-white/20 hover:bg-white/10"
            >
              See what pays most
            </ActionLink>
          </div>
        </div>
      ) : null}

      {/* The store-wide link: the one to put in a bio. */}
      <ShareLinkCard
        link={affiliateStoreLink(affiliate.code)}
        code={affiliate.code}
        message={affiliate.shareMessage}
        suspended={affiliate.status !== "active"}
      />

      {/* What happened over the window, against the window before it. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Link clicks"
          value={totals.clicks.toLocaleString("en-GB")}
          change={change(totals.clicks, previous?.clicks)}
          icon={MousePointerClick}
          href={`/affiliate/links${range}`}
        />
        <Metric
          label="Referred orders"
          value={totals.orders.toLocaleString("en-GB")}
          change={change(totals.orders, previous?.orders)}
          icon={ShoppingBag}
          href={`/affiliate/orders${range}`}
          note={`${totals.conversion}% of clicks`}
        />
        <Metric
          label="Sales referred"
          value={formatPrice(totals.sales)}
          change={change(totals.sales, previous?.sales)}
          icon={TrendingUp}
          href={`/affiliate/orders${range}`}
        />
        <Metric
          label="Commission earned"
          value={formatMoney(totals.commission)}
          change={change(totals.commission, previous?.commission)}
          icon={Receipt}
          href={`/affiliate/commissions${range}`}
          note={totals.orders > 0 ? `${formatMoney(totals.perOrder)} per order` : undefined}
        />
      </div>

      {/* The balance: four states one amount can be in, and only one is yours. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Awaiting delivery"
          value={formatMoney(balance.pending)}
          hint="Paid orders not delivered yet"
          href="/affiliate/commissions?status=pending"
        />
        <Tile
          label="In return window"
          value={formatMoney(balance.clearing)}
          hint="Delivered — clearing shortly"
          href="/affiliate/commissions?status=clearing"
        />
        <Tile
          label="Available now"
          value={formatMoney(balance.available)}
          hint="Ready to request"
          href="/affiliate/earnings"
          strong
        />
        <Tile
          label="Paid out"
          value={formatMoney(balance.paid)}
          hint="Settled by past payouts"
          href="/affiliate/earnings"
        />
      </div>

      {board.items.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-niki-ink">Waiting on you</h2>
              <p className="text-xs text-niki-ink/55">
                {board.items.length} outstanding
                {board.overdue > 0 ? (
                  <span className="font-semibold text-niki-danger"> · {board.overdue} overdue</span>
                ) : null}
                . Worked out from your orders and conversations.
              </p>
            </div>
            <ActionLink
              href="/affiliate/follow-ups"
              className="text-sm font-semibold text-niki-orange hover:underline"
            >
              See all
            </ActionLink>
          </div>
          <FollowUpList items={board.items} limit={4} />
        </section>
      ) : null}

      <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-niki-ink">Commission over time</h2>
            <p className="text-xs text-niki-ink/55">
              What your links earned across the {w.label}.
            </p>
          </div>
          <p className="font-figures text-xl font-bold text-niki-ink">
            {formatMoney(totals.commission)}
          </p>
        </div>
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
          <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
            Nothing to plot yet.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-3 font-display font-bold text-niki-ink">Your best products</h2>
          <BarList
            rows={top}
            format={(v) => formatMoney(v)}
            empty="No sales in this window yet."
          />
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <h2 className="mb-3 font-display font-bold text-niki-ink">Where clicks come from</h2>
          <BarList
            rows={channels}
            format={(v) => v.toLocaleString("en-GB")}
            empty="No clicks in this window yet."
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
    </div>
  );
}

function change(now: number, before: number | undefined | null): number | null {
  if (before === undefined || before === null) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}

function Metric({
  label,
  value,
  change,
  note,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  change: number | null;
  note?: string;
  icon: React.ElementType;
  href: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <ActionLink
      href={href}
      className="group niki-lift block rounded-2xl bg-white p-5 ring-1 ring-niki-edge hover:shadow-lg hover:shadow-niki-black/5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Icon className="h-4 w-4" />
        </span>
        {change !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold",
              up ? "bg-niki-success/10 text-niki-success" : "bg-niki-danger/10 text-niki-danger",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}%
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-figures text-2xl font-bold text-niki-ink">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-sm text-niki-ink/60">
        {label}
        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      {note ? <p className="mt-0.5 text-[11px] text-niki-ink/45">{note}</p> : null}
    </ActionLink>
  );
}

function Tile({
  label,
  value,
  hint,
  href,
  strong = false,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  strong?: boolean;
}) {
  return (
    <ActionLink
      href={href}
      className={cn(
        "group niki-lift block rounded-2xl p-5 ring-1 transition-shadow hover:shadow-lg hover:shadow-niki-black/5",
        strong ? "bg-niki-black text-white ring-niki-black" : "bg-white ring-niki-edge",
      )}
    >
      <p className={cn("font-figures text-xl font-bold", strong ? "text-white" : "text-niki-ink")}>
        {value}
      </p>
      <p className={cn("mt-1 text-sm", strong ? "text-white/80" : "text-niki-ink/65")}>{label}</p>
      <p className={cn("mt-0.5 text-[11px]", strong ? "text-white/50" : "text-niki-ink/45")}>
        {hint}
      </p>
    </ActionLink>
  );
}
