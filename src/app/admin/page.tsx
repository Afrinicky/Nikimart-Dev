import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Gift,
  LifeBuoy,
  ListOrdered,
  Package,
  PackageCheck,
  PiggyBank,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { ExportButton } from "@/components/admin/ExportButton";
import { formatPrice } from "@/lib/format";
import { isPaymentConfigured } from "@/lib/payments";
import { emailStatus, isSmsConfigured } from "@/lib/notifications";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import {
  FULFILMENT_COLOUR,
  FULFILMENT_LABELS,
  FULFILMENT_STAGES,
} from "@/lib/retail/fulfilment";
import {
  changePercent,
  getCategoryMix,
  getChannelMix,
  getRetailOperations,
  getRetailSeries,
  getRetailStanding,
  getRetailTotals,
  getShopMix,
  getStageMix,
} from "@/lib/retail/overview";
import { getEconomicsTotals } from "@/lib/retail/economics";
import { getAffiliateWindowOverview } from "@/lib/affiliate";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Retail Services — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The mall at a glance.
 *
 * Two things were wrong with what this used to be. Every figure was all-time —
 * total users, total products, GMV since the shop opened — and an all-time
 * total only goes up, so nothing on the screen could tell you whether this
 * month was better or worse than the last. And the one thing that *was*
 * actionable, the orders needing attention, was buried under eight counters
 * that were not.
 *
 * So it is the bundle console's overview applied to the mall: everything
 * scoped to a window and compared against the window before it, every number
 * leading to the rows it was counted from, what is waiting on a person pulled
 * out and labelled, and the shape of the business drawn rather than listed.
 *
 * The window opens on the current month, because a shop's books are kept by
 * the month; a rolling thirty days straddles two of them and can be reconciled
 * against neither.
 */

/** How an alert reads: the card, the icon's chip, and the halo live ones pulse. */
const ALERT_TONES = {
  danger: {
    card: "bg-niki-danger/[0.07] text-niki-danger ring-1 ring-niki-danger/20 hover:bg-niki-danger/[0.12]",
    chip: "bg-niki-danger/15 text-niki-danger",
    pulse: "bg-niki-danger/30",
  },
  warn: {
    card: "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100",
    chip: "bg-amber-500/20 text-amber-700",
    pulse: "bg-amber-400/40",
  },
  trust: {
    card: "bg-niki-trust/[0.07] text-niki-ink ring-1 ring-niki-trust/20 hover:bg-niki-trust/[0.12]",
    chip: "bg-niki-trust/15 text-niki-trust",
    pulse: "bg-niki-trust/30",
  },
  plain: {
    card: "bg-white text-niki-ink ring-1 ring-niki-edge hover:bg-niki-black/5",
    chip: "bg-niki-surface text-niki-ink/55",
    pulse: "bg-niki-ink/15",
  },
} as const;

function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "ink",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "danger" | "orange";
  /** Percent change on the window before. Null when there is no baseline. */
  delta?: number | null;
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;

  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-5"
    >
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 sm:mt-2 sm:gap-2">
        <p className={`font-figures text-lg font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
        {delta === null || delta === undefined ? null : (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
              delta >= 0
                ? "bg-niki-success/10 text-niki-success"
                : "bg-niki-danger/10 text-niki-danger",
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint ? <p className="mt-0.5 text-[11px] text-niki-ink/50 sm:text-xs">{hint}</p> : null}
    </ActionLink>
  );
}

function Panel({
  title,
  subtitle,
  href,
  linkLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-niki-ink">{title}</h2>
          {subtitle ? <p className="text-xs text-niki-ink/55">{subtitle}</p> : null}
        </div>
        {href ? (
          <ActionLink
            href={href}
            className="shrink-0 text-xs font-semibold text-niki-trust hover:underline"
          >
            {linkLabel ?? "See all"}
          </ActionLink>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  // The month is the window this console opens on: a shop's books are kept by
  // the month, and a rolling thirty days straddles two of them.
  const period = resolveWindow(await searchParams, new Date(), { fallback: "month" });

  const [
    totals,
    series,
    stageMix,
    categories,
    shops,
    channels,
    operations,
    standing,
    recent,
    economics,
    affiliates,
  ] = await Promise.all([
      getRetailTotals(period),
      getRetailSeries(period),
      getStageMix(period),
      getCategoryMix(period),
      getShopMix(period),
      getChannelMix(period),
      getRetailOperations(period),
      getRetailStanding(),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          user: { select: { name: true, email: true } },
        },
      }),
      // What the orders actually made, which "revenue" never said: an
      // imported line is bought and resold, a shop's line earns a commission,
      // and until both were written down the two could not be added up.
      getEconomicsTotals(period),
      getAffiliateWindowOverview(period),
    ]);

  const windowLabel = period.label;
  const asAtLabel = period.key === "all" ? "" : ` as at ${period.to}`;

  const stageSlices = FULFILMENT_STAGES.filter((s) => (stageMix[s] ?? 0) > 0).map((s) => ({
    key: s,
    label: FULFILMENT_LABELS[s],
    count: stageMix[s] ?? 0,
    colour: FULFILMENT_COLOUR[s],
    href: `/admin/orders?stage=${s}`,
  }));

  const emails = emailStatus();
  const checks = [
    {
      // The mall has its own Paystack account; the bundle store's key is the
      // other console's business, and a green tick there proves nothing here.
      ok: isPaymentConfigured("retail"),
      label: "Paystack (retail)",
      detail: isPaymentConfigured("retail")
        ? "Collecting real payments into the mall's account."
        : "Set PAYSTACK_SECRET_KEY — until then orders settle without charging.",
    },
    {
      ok: emails.deliverable,
      label: "Resend email",
      detail: emails.deliverable
        ? `Buyers are emailed their receipts from ${emails.from}.`
        : `${emails.detail} Check it under Admin → Settings.`,
    },
    {
      ok: isSmsConfigured(),
      label: "Arkesel SMS",
      detail: isSmsConfigured()
        ? "Buyers get a text when their order moves."
        : "Set ARKESEL_API_KEY to text buyers their updates.",
    },
    {
      ok: standing.pickupPoints > 0,
      label: "Pickup points",
      detail:
        standing.pickupPoints > 0
          ? `${standing.pickupPoints} collection point${standing.pickupPoints === 1 ? "" : "s"} open to buyers.`
          : "No active pickup point, so nobody can choose collection at checkout.",
    },
    {
      ok: standing.activeProducts > 0,
      label: "Products in stock",
      detail:
        standing.activeProducts > 0
          ? `${standing.activeProducts} of ${standing.products} listings can be bought today.`
          : "Every listing is out of stock, so the mall has nothing to sell.",
    },
    {
      ok: standing.shops > 0,
      label: "Shops",
      detail:
        standing.shops > 0
          ? `${standing.shops} shop${standing.shops === 1 ? "" : "s"} on the mall.`
          : "No shops yet — a mall with no sellers has no catalogue.",
    },
  ];

  const attention = [
    operations.toPlace > 0
      ? {
          key: "place",
          href: "/admin/orders/placement",
          tone: "danger" as const,
          icon: ClipboardList,
          live: true,
          text:
            operations.toPlace === 1
              ? "1 paid order has not been bought from its supplier yet. Its buyer is waiting on that one step."
              : `${operations.toPlace} paid orders have not been bought from their suppliers yet. Their buyers are waiting on that one step.`,
        }
      : null,
    operations.openThreads > 0
      ? {
          key: "threads",
          href: "/admin/affiliates/support",
          tone: "danger" as const,
          icon: LifeBuoy,
          live: true,
          text: `${operations.openThreads} affiliate ${operations.openThreads === 1 ? "enquiry is" : "enquiries are"} waiting on an answer from Nickimart.`,
        }
      : null,
    operations.ready > 0
      ? {
          key: "ready",
          href: "/admin/orders?stage=ready",
          tone: "trust" as const,
          icon: PackageCheck,
          live: true,
          text: `${operations.ready} order${operations.ready === 1 ? " is" : "s are"} ready and waiting on the buyer to collect.`,
        }
      : null,
    operations.outstanding > 0
      ? {
          key: "outstanding",
          href: "/admin/orders?payment=part",
          tone: "warn" as const,
          icon: Banknote,
          text: `${formatPrice(operations.outstanding)} is still owed on live orders — the shipping buyers chose to settle on collection.`,
        }
      : null,
    operations.pendingShops > 0
      ? {
          key: "shops",
          href: "/admin/vendors?status=pending",
          tone: "trust" as const,
          icon: Store,
          text: `${operations.pendingShops} shop${operations.pendingShops === 1 ? " is" : "s are"} waiting on verification.`,
        }
      : null,
    operations.pendingPayment > 0
      ? {
          key: "unpaid",
          href: "/admin/orders?stage=awaiting_payment",
          tone: "warn" as const,
          icon: AlertTriangle,
          text:
            operations.pendingPayment === 1
              ? `1 checkout was never finished (${windowLabel}). Reach the buyer and help them complete it.`
              : `${operations.pendingPayment} checkouts were never finished (${windowLabel}). Reach those buyers and help them complete.`,
        }
      : null,
    operations.outOfStock > 0
      ? {
          key: "stock",
          href: "/admin/products",
          tone: "plain" as const,
          icon: Package,
          text: `${operations.outOfStock} in-stock listing${operations.outOfStock === 1 ? " has" : "s have"} run to zero, so nobody can buy ${operations.outOfStock === 1 ? "it" : "them"}.`,
        }
      : null,
  ].filter(Boolean);

  return (
    <Container className="py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Retail Services</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {standing.shops} shop{standing.shops === 1 ? "" : "s"} · {standing.activeProducts} listing
            {standing.activeProducts === 1 ? "" : "s"} in stock · data bundles and the agent network
            are their own console
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="orders" label="Export orders" />
          <Link
            href="/admin/products/new"
            className="rounded-lg bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Add a product
          </Link>
        </div>
      </div>

      {/* What the mall is, right now. Standing counts, so they answer to
          nothing above them. */}
      <div className="niki-gradient-card mt-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl p-4 text-white sm:mt-6 sm:gap-4 sm:p-6 lg:grid-cols-4">
        <Standing label="Customers" value={standing.customers} icon={Users} href="/admin/users" />
        <Standing label="Shops" value={standing.shops} icon={Store} href="/admin/vendors" />
        <Standing
          label="Listings"
          value={standing.products}
          icon={Package}
          href="/admin/products"
          hint={`${standing.activeProducts} in stock`}
        />
        <Standing
          label="Affiliates"
          value={standing.affiliates}
          icon={Gift}
          href="/admin/affiliates"
          hint={`${standing.pickupPoints} pickup points`}
        />
      </div>

      {/* The window everything below is measured over. Suspense because the
          pills build their links off the query string. */}
      <div className="mt-5">
        <Suspense fallback={<div className="h-8" />}>
          <OverviewRange
            active={period.key}
            label={period.label}
            from={period.from}
            to={period.to}
            basePath="/admin"
          />
        </Suspense>
      </div>

      {/* Trading, over the window. Revenue is what buyers actually paid; what
          the orders are worth in full is the tile beside it, because half the
          mall's orders settle the freight on collection and counting that as
          money in would overstate every month. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Stat
          label="Revenue"
          value={formatPrice(totals.revenue)}
          hint={`Collected · ${windowLabel}`}
          href="/admin/orders"
          icon={TrendingUp}
          delta={changePercent(totals.revenue, totals.previous?.revenue)}
        />
        <Stat
          label="Booked"
          value={formatPrice(totals.booked)}
          hint={
            totals.outstanding > 0
              ? `${formatPrice(totals.outstanding)} of it due on collection`
              : `Order value · ${windowLabel}`
          }
          href="/admin/finance/breakdown/gmv"
          icon={Wallet}
          delta={changePercent(totals.booked, totals.previous?.booked)}
        />
        <Stat
          label="Orders"
          value={String(totals.orders)}
          hint={`Paid · ${windowLabel}`}
          href="/admin/orders"
          icon={ListOrdered}
          delta={changePercent(totals.orders, totals.previous?.orders)}
        />
        <Stat
          label="Gross income"
          value={formatPrice(economics.gross)}
          hint={
            economics.selling > 0
              ? `${economics.margin}% of what was sold · before affiliates`
              : `Before affiliates · ${windowLabel}`
          }
          href="/admin/finance/orders"
          icon={PiggyBank}
          tone="success"
        />
        <Stat
          label="Net income"
          value={formatPrice(economics.net)}
          hint={
            economics.affiliateCost > 0
              ? `After ${formatPrice(economics.affiliateCost)} of affiliate commission`
              : `What Nickimart keeps · ${windowLabel}`
          }
          href="/admin/finance/orders"
          icon={Wallet}
          tone="success"
        />
      </div>

      {/* What the goods cost, and what the programme that sells them costs.
          Five tiles rather than two, because "net income" is a subtraction and
          an admin reading it wants to see what was taken off. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Stat
          label="Cost of goods"
          value={formatPrice(economics.cost)}
          hint={`Paid to suppliers and shops · ${windowLabel}`}
          href="/admin/finance/orders"
          icon={ShoppingBag}
        />
        <Stat
          label="New customers"
          value={String(totals.newCustomers)}
          hint={`${totals.buyers} bought something · ${windowLabel}`}
          href="/admin/users"
          icon={Users}
          delta={changePercent(totals.newCustomers, totals.previous?.newCustomers)}
        />
        <Stat
          label="Affiliate commission"
          value={formatPrice(affiliates.commissionEarned)}
          hint={`Earned on referred sales · ${windowLabel}`}
          href="/admin/affiliates/commissions"
          icon={Gift}
          delta={changePercent(
            affiliates.commissionEarned,
            affiliates.previous?.commissionEarned,
          )}
        />
        <Stat
          label="Paid to affiliates"
          value={formatPrice(affiliates.paidOut)}
          hint={`${windowLabel} · on MoMo and bank`}
          href="/admin/affiliates/payouts"
          icon={Banknote}
          tone="success"
        />
        <Stat
          label="Owed to affiliates"
          value={formatPrice(affiliates.owed)}
          hint={
            affiliates.pendingPayoutCount > 0
              ? `${formatPrice(affiliates.pendingPayouts)} already requested`
              : `Cleared and unpaid${asAtLabel}`
          }
          href="/admin/affiliates/payouts?status=pending"
          icon={Wallet}
          tone={affiliates.owed > 0 ? "orange" : "ink"}
        />
      </div>

      {attention.length > 0 ? (
        <section className="mt-4">
          {/* Labelled, because everything above this point answers to the date
              picker and a shop waiting on verification does not: an
              application made in February is still somebody waiting today. */}
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              Needs attention
            </h2>
            <span className="rounded-md bg-niki-ink/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-niki-ink/45">
              Live
            </span>
          </div>
          <ul className="space-y-2">
            {attention.map((a) =>
              a ? (
                <li key={a.key}>
                  <ActionLink
                    href={a.href}
                    className={cn(
                      "niki-focus group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-colors sm:gap-3 sm:px-4 sm:py-3 sm:text-sm",
                      ALERT_TONES[a.tone].card,
                    )}
                  >
                    {/* The icon sits in a chip of its own so the row reads as a
                        thing rather than a sentence with a picture in front of
                        it — and so the live ones have somewhere to pulse. */}
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9">
                      {"live" in a && a.live ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-0 animate-ping rounded-xl opacity-40",
                            ALERT_TONES[a.tone].pulse,
                          )}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9",
                          ALERT_TONES[a.tone].chip,
                        )}
                      >
                        <a.icon className="h-4 w-4" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">{a.text}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-70" />
                  </ActionLink>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {/* The shape of the window. */}
      <div className="mt-4">
        <Panel
          title="Revenue"
          subtitle={`${formatPrice(totals.revenue)} collected on ${totals.orders} paid order${totals.orders === 1 ? "" : "s"} · ${windowLabel}`}
          href="/admin/orders"
          linkLabel="All orders"
        >
          <TrendChart
            points={series.map((d) => ({
              day: d.day,
              endDay: d.endDay,
              value: d.revenue,
              label: formatPrice(d.revenue),
              count: d.orders,
              // Clicking a point narrows the whole overview onto it, so every
              // panel below is describing that day rather than the window it
              // sat inside.
              href: `/admin?from=${d.day}&to=${d.endDay ?? d.day}`,
            }))}
            countLabel="orders"
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Where orders end up" subtitle={windowLabel}>
          <StatusBar slices={stageSlices} />
        </Panel>

        <Panel
          title="Categories"
          subtitle="Revenue by category"
          href="/admin/categories"
          linkLabel="All categories"
        >
          <BarList
            rows={categories.slice(0, 6).map((c) => ({
              key: c.key,
              label: c.label,
              value: c.revenue,
              note: `${c.units} unit${c.units === 1 ? "" : "s"}`,
              href: c.key === "none" ? "/admin/products" : `/categories/${c.key}`,
            }))}
            format={formatPrice}
            empty="No paid orders in this window."
          />
        </Panel>

        <Panel title="Where sales come from" subtitle="Revenue by channel">
          <BarList
            rows={channels.map((c) => ({
              key: c.key,
              label: c.label,
              value: c.revenue,
              note: `${c.orders} order${c.orders === 1 ? "" : "s"}`,
              href: c.key === "affiliate" ? "/admin/affiliates" : "/admin/orders",
            }))}
            format={formatPrice}
            empty="No paid orders in this window."
          />
        </Panel>
      </div>

      {/* Fulfilment, over the window. The figures that say whether the orders
          are being worked rather than simply taken. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Stat
          label="To be placed"
          value={String(operations.toPlace)}
          hint={`Paid for, not yet bought${asAtLabel}`}
          href="/admin/orders/placement"
          icon={ClipboardList}
          tone={operations.toPlace > 0 ? "orange" : "ink"}
        />
        <Stat
          label="Ready for the buyer"
          value={String(operations.ready)}
          hint={`Waiting to be collected${asAtLabel}`}
          href="/admin/orders?stage=ready"
          icon={PackageCheck}
          tone={operations.ready > 0 ? "success" : "ink"}
        />
        <Stat
          label="Outstanding"
          value={formatPrice(operations.outstanding)}
          hint={`Due from buyers on collection${asAtLabel}`}
          href="/admin/orders?payment=part"
          icon={Banknote}
          tone={operations.outstanding > 0 ? "orange" : "ink"}
        />
        <Stat
          label="Average order"
          value={formatPrice(totals.aov)}
          hint={`${totals.units} unit${totals.units === 1 ? "" : "s"} sold · ${windowLabel}`}
          href="/admin/orders"
          icon={ShoppingBag}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Shop performance"
          subtitle={`Best selling shops · ${windowLabel}`}
          href="/admin/vendors"
          linkLabel="All shops"
        >
          {shops.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
              No shop sold anything in this window.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-12 gap-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40 sm:grid">
                <span className="col-span-6">Shop</span>
                <span className="col-span-2 text-right">Orders</span>
                <span className="col-span-2 text-right">Units</span>
                <span className="col-span-2 text-right">Sales</span>
              </div>
              <ul className="space-y-1">
                {shops.slice(0, 8).map((s) => {
                  const share = s.revenue / Math.max(shops[0].revenue, 1);
                  return (
                    <li key={s.key}>
                      <ActionLink
                        href={s.key === "none" ? "/admin/products" : `/admin/vendors/${s.key}`}
                        className="niki-focus block rounded-xl px-3 py-2.5 transition-colors hover:bg-niki-surface/70"
                      >
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-12 sm:items-center sm:gap-3">
                          <p className="min-w-0 truncate text-sm font-semibold text-niki-ink sm:col-span-6">
                            {s.label}
                          </p>
                          {/* Wraps rather than squeezes on a phone: three
                              labelled figures in one justified row leaves each
                              of them a couple of characters wide. */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:col-span-6 sm:grid sm:grid-cols-6 sm:gap-3 sm:text-sm">
                            <span className="text-niki-ink/60 sm:col-span-2 sm:text-right">
                              <span className="sm:hidden">Orders </span>
                              {s.orders}
                            </span>
                            <span className="text-niki-ink/60 sm:col-span-2 sm:text-right">
                              {s.units}
                              <span className="ml-1 sm:hidden">units</span>
                            </span>
                            <span className="font-figures font-bold text-niki-ink sm:col-span-2 sm:text-right">
                              {formatPrice(s.revenue)}
                            </span>
                          </div>
                        </div>
                        {/* The bar is the ranking made visible — the figures
                            are all printed, so it adds shape rather than data. */}
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-niki-surface">
                          <div
                            className="h-full rounded-full bg-niki-orange"
                            style={{ width: `${Math.max(2, share * 100)}%` }}
                          />
                        </div>
                      </ActionLink>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        <Panel
          title="Latest orders"
          subtitle="The last six, whenever they were placed"
          href="/admin/orders"
          linkLabel="All orders"
        >
          <ul className="space-y-1">
            {recent.map((o) => (
              <li key={o.id}>
                <ActionLink
                  href={`/admin/orders/${o.id}`}
                  className="niki-focus flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-niki-surface/70"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-semibold text-niki-ink">
                      {o.orderNumber}
                    </span>
                    <span className="block truncate text-xs text-niki-ink/55">
                      {o.user.name ?? o.user.email} ·{" "}
                      {o.createdAt.toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-figures font-bold text-niki-ink">
                      {formatPrice(o.total)}
                    </span>
                    {o.balanceDue > 0 ? (
                      <span className="block text-[11px] font-semibold text-niki-orange">
                        {formatPrice(o.balanceDue)} due
                      </span>
                    ) : null}
                  </span>
                </ActionLink>
              </li>
            ))}
            {recent.length === 0 ? (
              <li className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                No orders yet.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      {/* Setup checklist */}
      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        <h2 className="font-display font-bold text-niki-ink">Setup</h2>
        <p className="text-xs text-niki-ink/55">
          What the mall needs before it can take real orders.
        </p>
        <ul className="mt-4 space-y-3">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-niki-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-semibold text-niki-ink">{c.label}</p>
                <p className="text-xs text-niki-ink/60">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

/** One of the standing counts in the band under the title. */
function Standing({
  label,
  value,
  icon: Icon,
  href,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  hint?: string;
}) {
  return (
    <ActionLink href={href} className="niki-focus group block transition-opacity hover:opacity-90">
      <div className="flex items-center gap-1.5 text-white/60 sm:gap-2">
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-xs">{label}</span>
      </div>
      <p className="mt-0.5 font-figures text-xl font-bold sm:mt-1 sm:text-3xl">
        {value.toLocaleString("en-GH")}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[10px] text-white/50 sm:text-xs">{hint}</p>
      ) : null}
    </ActionLink>
  );
}
