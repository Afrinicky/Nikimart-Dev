import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  ExternalLink,
  HandCoins,
  ListOrdered,
  PiggyBank,
  TrendingUp,
  Package,
  Receipt,
  ReceiptText,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { BalanceAdjuster, TopupReconciler } from "@/components/admin/AgentAdminTools";
import { AgentAccountTools, SetupLinkTool } from "@/components/admin/AgentAccountTools";
import { AgentWindow } from "@/components/admin/AgentWindow";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { ReferrerTool } from "@/components/admin/ReferrerTool";
import { ReferralWaiverTool } from "@/components/admin/ReferralWaiverTool";
import { RecruitPaymentTool } from "@/components/admin/RecruitPaymentTool";
import { OrderActions, type OrderView } from "@/components/data/OrderActions";
import { OrderFilters } from "@/components/data/OrderFilters";
import { OrderPager } from "@/components/data/OrderPager";
import { LiveOrders } from "@/components/data/LiveOrders";
import { siteUrl } from "@/lib/site";
import { NetworkCell, StatusPill, formatWhen } from "@/components/agent/AgentUi";
import { dataDb } from "@/lib/data-db";
import { formatMoney, formatPrice } from "@/lib/format";
import { bundleLabel } from "@/lib/data-bundles/networks";
import {
  ORDER_NETWORK_OPTIONS,
  ORDER_STATUS_OPTIONS,
  orderStatusFilter,
  perPageFrom,
} from "@/lib/data-bundles/order-filters";
import { getDataOrders, orderIncome, orderSourceLabel } from "@/lib/data-bundles/reporting";
import { syncOpenOrders } from "@/lib/data-bundles/order-sync";
import {
  markDataOrderRefunded,
  refreshDataOrderStatus,
  retryDataOrder,
} from "@/lib/data-bundles/admin-actions";
import {
  countAgentOrders,
  getAgentLedger,
  getAgentWallet,
  getAgentWithdrawals,
} from "@/lib/data-bundles/agents";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { setAgentStatus } from "@/lib/data-bundles/agent-admin-actions";
import { getAgentProgramConfig, getReferralConfig } from "@/lib/data-bundles/settings";
import {
  changePercent,
  getAgentWindowTotals,
  getDailySeries,
  resolveWindow,
} from "@/lib/data-bundles/overview";
import { registrationFeeBreakdown } from "@/lib/data-bundles/referral-rules";
import { recruitPaymentRule } from "@/lib/data-bundles/referrals";

import { ledgerTypeLabel } from "@/lib/data-bundles/ledger-labels";
import { pendingTopupsFor } from "@/lib/data-bundles/wallet";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agent — Admin — Nickimart" };
export const dynamic = "force-dynamic";

// The same two class strings the main bundle-orders table uses, so the
// agent-scoped copy of it sits on exactly the same grid.
const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";
// Shown against a commission or income figure that is not money yet.
const notBanked = "Not banked — this order is unpaid or refunded.";

/**
 * One agent's window: everything known about them, and everything that can be
 * done to them, grouped by the question being asked.
 *
 * Four groups rather than one long column — how they're doing, what's in their
 * wallet, who they recruit, what the account is. The ordering is deliberate:
 * the two you open daily come first, and the two that change an account
 * permanently are last.
 */

const TONES = {
  ink: "text-niki-ink",
  success: "text-niki-success",
  danger: "text-niki-danger",
  orange: "text-niki-orange",
} as const;

/**
 * One figure, with what it is and — where there is an honest baseline — how it
 * moved.
 *
 * The icon chip is what separates the two rows of these at a glance: the
 * account's own standing figures sit in neutral chips, the ones counted over
 * the chosen window in orange ones. Without that they are twelve identical
 * boxes and nobody can tell which three ignore the date picker.
 */
function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "ink",
  accent = false,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ElementType;
  tone?: keyof typeof TONES;
  /** Orange chip: this figure is counted over the window, not all time. */
  accent?: boolean;
  /** Percent change on the window before. Null when there is no baseline. */
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge transition-shadow hover:shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        {Icon ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              accent ? "bg-niki-orange/10 text-niki-orange" : "bg-niki-surface text-niki-ink/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45">
          {label}
        </p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
        <p className={cn("font-figures text-xl font-bold sm:text-2xl", TONES[tone])}>{value}</p>
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
      {hint ? <p className="mt-1 text-xs text-niki-ink/45">{hint}</p> : null}
    </div>
  );
}

/**
 * The agent's initials, for the monogram on the identity card.
 *
 * Off the store name, which is what the page is titled by and what everybody
 * calls them. "Omar8080" gives "OM" rather than "O8": a digit in a monogram
 * reads as a number somebody should recognise.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  const letters = words
    .map((w) => w.match(/[A-Za-z]/)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  if (letters.length >= 2) return letters.toUpperCase();
  const first = words[0].replace(/[^A-Za-z]/g, "");
  return (first.slice(0, 2) || words[0].slice(0, 2)).toUpperCase();
}

function Panel({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-niki-ink">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-niki-ink/55">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-niki-ink/55">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-niki-ink">{value}</dd>
    </div>
  );
}

export default async function AdminAgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    network?: string;
    q?: string;
    page?: string;
    per?: string;
    days?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { id } = await params;

  // The orders table below is the console's own bundle-orders table, scoped to
  // this agent, so it reads its filters out of the query string the same way.
  const sp = await searchParams;
  const status = orderStatusFilter(sp.status).value;
  const network = ORDER_NETWORK_OPTIONS.some((n) => n.value === sp.network) ? sp.network! : "all";
  const query = (sp.q ?? "").trim();
  const perPage = perPageFrom(sp.per, 25);
  const page = Math.max(1, Number(sp.page) || 1);
  // The stretch of time the dashboard above the tabs is describing. Read with
  // the same function the business overview uses, so "last 30 days" means the
  // same days on both screens.
  const period = resolveWindow(sp);

  const row = await dataDb.dataAgent.findUnique({ where: { id } }).catch(() => null);
  if (!row) notFound();

  // Re-ask the provider about this agent's orders that are still moving before
  // the page is built. The provider's callback is unreliable, so a status that
  // changed upstream would otherwise sit here until the nightly sweep.
  await syncOpenOrders({ agentId: row.id });

  // The person behind the agent lives in the retail database — one extra query
  // rather than an include.
  const agent = { ...row, user: await getAgentUser(row.userId) };

  const [referrer, recruits] = await Promise.all([
    row.referredById
      ? dataDb.dataAgent
          .findUnique({
            where: { id: row.referredById },
            select: { id: true, code: true, storeName: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    dataDb.dataAgent
      .findMany({
        where: { referredById: row.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          storeName: true,
          status: true,
          createdAt: true,
          setupFeePaidAt: true,
          setupFeeSettledBy: true,
        },
      })
      .catch(() => []),
  ]);

  const [
    wallet,
    ledger,
    orderPage,
    orderCount,
    withdrawals,
    referralConfig,
    program,
    pendingTopups,
    trading,
    series,
  ] = await Promise.all([
    getAgentWallet(agent),
    getAgentLedger(agent.id, 25),
    getDataOrders({ agentId: agent.id, status, network, query, page, perPage }),
    // The filters move the table's own total around, so the account summary
    // asks separately for the number of orders this agent has ever taken.
    countAgentOrders(agent.id),
    getAgentWithdrawals(agent.id, 10),
    getReferralConfig(),
    getAgentProgramConfig(),
    pendingTopupsFor(agent.id),
    getAgentWindowTotals(agent.id, period),
    getDailySeries(period, { agentId: agent.id }),
  ]);

  const pageCount = Math.max(1, Math.ceil(orderPage.total / perPage));
  const filtered = status !== "all" || network !== "all" || query !== "";
  // Orders still moving on this page. Nothing polls when there are none.
  const openOnPage = orderPage.orders.filter(
    (o) => o.status === "queued" || o.status === "processing",
  ).length;

  const suspended = agent.status !== "active";
  // "last 30 days", "all time", "1–14 Mar 2026" — said once, under every
  // figure the window governs, so nothing on screen is ambiguous about it.
  const windowLabel = period.label;

  /**
   * Narrowing the window onto one point of the trend, without throwing away
   * what the orders table below is holding in the same query string. The range
   * pills preserve it too, so the two controls behave the same way.
   */
  const pointHref = (day: string, endDay?: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value && key !== "days" && key !== "from" && key !== "to") next.set(key, value);
    }
    next.set("from", day);
    next.set("to", endDay ?? day);
    return `/admin/data/agents/${agent.id}?${next.toString()}`;
  };
  // What this registration was made of, read back off the row rather than
  // recomputed: the settings may have changed a dozen times since.
  const fee = registrationFeeBreakdown(agent);
  // What their recruits actually get, once the programme and this agent's own
  // exception have both had their say — read back through the same function
  // the agent's own screen uses, rather than recomputed here, so the two can
  // never disagree about what is in force.
  const rule = await recruitPaymentRule(agent.id);

  const settledLabel =
    agent.setupFeeSettledBy === "ADJUSTMENT"
      ? "Cleared by an admin adjustment — no referral reward was paid"
      : agent.setupFeeSettledBy === "PAYMENT"
        ? "Paid"
        : agent.setupFeeSettledBy === "COMMISSION"
          ? "Cleared from commission"
          : agent.setupFeeSettledBy === "WAIVED"
            ? "Waived"
            : agent.setupFeePaidAt
              ? "Settled"
              : "Outstanding";

  return (
    <div>
      <ActionLink
        href="/admin/data/agents"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </ActionLink>

      {/* Who this is, as one card rather than four lines of loose text. The
          monogram gives the page something to be recognised by when you have
          six agent tabs open, and the facts people quote down the phone — the
          code, the store link, when they joined — are chips they can see at a
          glance instead of a sentence they have to read. */}
      <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-niki-orange to-niki-gold font-display text-lg font-bold text-niki-black shadow-sm shadow-niki-orange/25"
            >
              {initials(agent.storeName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-niki-ink">
                  {agent.storeName}
                </h1>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                    suspended
                      ? "bg-niki-danger/10 text-niki-danger"
                      : "bg-niki-success/10 text-niki-success",
                  )}
                >
                  {suspended ? "Suspended" : "Active"}
                </span>
              </div>
              <p className="mt-1 text-sm text-niki-ink/60">
                {agent.user?.name ?? "—"} · {agent.user?.email ?? "—"} ·{" "}
                <span className="font-mono">
                  {agent.supportPhone || agent.user?.phone || "—"}
                </span>
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-lg bg-niki-surface px-2 py-1 font-semibold text-niki-ink/60">
                  Code <span className="font-mono text-niki-ink">{agent.code}</span>
                </span>
                <span className="rounded-lg bg-niki-surface px-2 py-1 font-semibold text-niki-ink/60">
                  Joined {formatWhen(agent.createdAt)}
                </span>
                <span className="rounded-lg bg-niki-surface px-2 py-1 font-mono text-niki-ink/60">
                  /store/{agent.slug}
                </span>
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 font-semibold",
                    agent.storeOpen
                      ? "bg-niki-success/10 text-niki-success"
                      : "bg-niki-ink/5 text-niki-ink/55",
                  )}
                >
                  Storefront {agent.storeOpen ? "open" : "closed"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/store/${agent.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="niki-press niki-chip flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-niki-ink/75"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View store
            </a>
            <form action={setAgentStatus}>
              <input type="hidden" name="agentId" value={agent.id} />
              <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
              <button
                type="submit"
                className={cn(
                  "niki-press rounded-lg px-4 py-2 text-xs font-semibold text-white",
                  suspended ? "bg-niki-success" : "bg-niki-danger",
                )}
              >
                {suspended ? "Reactivate agent" : "Suspend agent"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {suspended ? (
        <p className="mt-4 rounded-2xl bg-niki-danger/10 px-5 py-4 text-sm text-niki-danger ring-1 ring-niki-danger/30">
          This agent is suspended. Their storefront is closed and delivered orders aren&apos;t
          crediting commission — reactivating releases anything that accrued while they were off.
        </p>
      ) : null}

      {/* The account as it stands. Deliberately above the date picker and
          outside everything it controls: a balance is what the account holds
          right now, and there is no such thing as last month's balance. */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40">
          The account · all time
        </p>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile
            label="Balance"
            value={formatMoney(wallet.balance)}
            icon={Wallet}
            tone={wallet.balance < 0 ? "danger" : "success"}
            hint={
              wallet.outstandingSetup > 0
                ? `${formatMoney(wallet.outstandingSetup)} registration still clearing`
                : wallet.pendingWithdrawals > 0
                  ? `${formatMoney(wallet.pendingWithdrawals)} committed to a withdrawal`
                  : undefined
            }
          />
          <Tile
            label="Commission earned"
            value={formatMoney(wallet.commissionEarned)}
            icon={Coins}
            hint={
              wallet.commissionPending > 0
                ? `${formatMoney(wallet.commissionPending)} not yet released`
                : undefined
            }
          />
          <Tile label="Sales" value={formatMoney(wallet.totalSales)} icon={Receipt} />
          <Tile label="Withdrawn" value={formatMoney(wallet.totalWithdrawn)} icon={PiggyBank} />
        </div>
      </div>

      {/* Everything from here to the tabs is counted over the chosen window. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-niki-ink">Trading</h2>
        {/* Suspense because the pills build their links off the query string. */}
        <Suspense fallback={<div className="h-8" />}>
          <OverviewRange
            active={period.key}
            label={period.label}
            from={period.from}
            to={period.to}
            basePath={`/admin/data/agents/${agent.id}`}
          />
        </Suspense>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Tile
          label="Sales"
          value={formatPrice(trading.sales)}
          hint={windowLabel}
          icon={TrendingUp}
          accent
          delta={changePercent(trading.sales, trading.previous?.sales)}
        />
        <Tile
          label="Orders"
          value={String(trading.orders)}
          hint={windowLabel}
          icon={ListOrdered}
          accent
          delta={changePercent(trading.orders, trading.previous?.orders)}
        />
        <Tile
          label="Agent commission"
          value={formatPrice(trading.agentCommission)}
          hint="What they earned"
          icon={Coins}
          accent
          delta={changePercent(trading.agentCommission, trading.previous?.agentCommission)}
        />
        <Tile
          label="Team commission"
          value={formatPrice(trading.teamCommission)}
          hint="What their recruiter earned"
          icon={Users}
          accent
          delta={changePercent(trading.teamCommission, trading.previous?.teamCommission)}
        />
        <Tile
          label="Income"
          value={formatPrice(trading.income)}
          hint="Sales less cost and commission"
          icon={HandCoins}
          accent
          tone={trading.income < 0 ? "danger" : "success"}
          delta={changePercent(trading.income, trading.previous?.income)}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-niki-ink">Revenue</h3>
            <p className="text-xs text-niki-ink/55">
              {formatPrice(trading.sales)} from {trading.orders} paid{" "}
              {trading.orders === 1 ? "order" : "orders"} · {windowLabel}
            </p>
          </div>
        </div>
        {series.length === 0 ? (
          <p className="rounded-xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
            Nothing sold in this window.
          </p>
        ) : (
          <TrendChart
            points={series.map((d) => ({
              day: d.day,
              endDay: d.endDay,
              value: d.revenue,
              label: formatPrice(d.revenue),
              count: d.orders,
              // Clicking a point narrows this agent's window onto it, the way
              // the business overview's own trend does.
              href: pointHref(d.day, d.endDay),
            }))}
            countLabel="orders"
          />
        )}
      </div>

      <AgentWindow
        sections={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="space-y-4">
                <LiveOrders open={openOnPage} />

                {/*
                  The console's bundle-orders table, narrowed to this agent.
                  Same columns, same filters, same row actions as
                  /admin/data/orders — an order looked at from an agent's
                  window and the same order looked at from the full list must
                  never read differently, so this is that table rather than a
                  summary of it.
                */}
                <Panel
                  title="Bundle orders"
                  icon={Package}
                  subtitle={`Every bundle sold through ${agent.storeName}.`}
                >
                  {!orderPage.available ? (
                    <p className="rounded-xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-800 ring-1 ring-amber-200">
                      The data bundle tables aren&apos;t on this database yet. Run{" "}
                      <code className="font-mono text-xs">nikimart-neon-data-bundles.sql</code> to
                      create them.
                    </p>
                  ) : (
                    <>
                      {/* Suspense because the filter bar reads the query string. */}
                      <Suspense fallback={<div className="h-40" />}>
                        <OrderFilters
                          status={status}
                          network={network}
                          query={query}
                          statusOptions={ORDER_STATUS_OPTIONS}
                          networkOptions={ORDER_NETWORK_OPTIONS}
                          shown={orderPage.orders.length}
                          total={orderPage.total}
                          page={page}
                          pageCount={pageCount}
                          exportHref={`/admin/data/orders/export?agent=${agent.id}`}
                        />
                      </Suspense>

                      {orderPage.orders.length === 0 ? (
                        <p className="mt-4 rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                          {filtered ? "No orders match these filters." : "No orders yet."}
                        </p>
                      ) : (
                        <>
                          <div className="-mx-5 mt-4 overflow-x-auto px-5">
                            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
                              <thead>
                                <tr className="bg-niki-surface/70">
                                  <th className={`${th} rounded-l-xl`}>Order ID</th>
                                  <th className={th}>Network</th>
                                  <th className={th}>Size</th>
                                  <th className={th}>Phone Number</th>
                                  <th className={th}>Price</th>
                                  <th className={th}>Commission</th>
                                  <th className={th}>Income</th>
                                  <th className={th}>Status</th>
                                  <th className={th}>Date</th>
                                  <th className={`${th} rounded-r-xl`}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {orderPage.orders.map((o) => {
                                  const label = orderSourceLabel(o);
                                  const house = o.source === "WEB" || !o.agentName;
                                  // What Nickimart keeps once the bundle and
                                  // every commission on it are paid for.
                                  const income = orderIncome(o);
                                  // An unpaid or refunded order's commission
                                  // and income are notional, so they are shown
                                  // greyed rather than as money in hand.
                                  const banked = o.paymentStatus === "paid" && o.status !== "refunded";
                                  return (
                                    <tr
                                      key={o.id}
                                      className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                                    >
                                      <td
                                        className={`${td} font-mono text-xs font-semibold text-niki-ink`}
                                      >
                                        {o.reference}
                                      </td>
                                      <td className={td}>
                                        <NetworkCell network={o.network} />
                                      </td>
                                      <td className={`${td} font-semibold text-niki-ink`}>
                                        {bundleLabel(o.sizeGb)}
                                      </td>
                                      <td className={`${td} font-mono text-xs text-niki-ink/70`}>
                                        {o.recipientPhone}
                                      </td>
                                      <td className={`${td} font-semibold text-niki-ink`}>
                                        {formatMoney(o.price)}
                                      </td>
                                      <td
                                        className={cn(
                                          `${td} font-semibold`,
                                          banked ? "text-niki-ink" : "text-niki-ink/40",
                                        )}
                                        title={banked ? undefined : notBanked}
                                      >
                                        {o.agentCommission > 0 ? formatMoney(o.agentCommission) : "—"}
                                      </td>
                                      <td
                                        className={cn(
                                          `${td} font-semibold`,
                                          !banked
                                            ? "text-niki-ink/40"
                                            : income < 0
                                              ? "text-niki-danger"
                                              : "text-niki-ink",
                                        )}
                                        title={banked ? undefined : notBanked}
                                      >
                                        {formatMoney(income)}
                                      </td>
                                      <td className={td}>
                                        <StatusPill status={o.status} />
                                      </td>
                                      <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                                        {o.createdAt.toLocaleString("en-GB", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </td>
                                      <td className={td}>
                                        <OrderActions
                                          order={
                                            {
                                              id: o.id,
                                              reference: o.reference,
                                              network: o.network,
                                              sizeGb: o.sizeGb,
                                              recipientPhone: o.recipientPhone,
                                              price: o.price,
                                              status: o.status,
                                              paymentStatus: o.paymentStatus,
                                              sourceLabel: label,
                                              agentSale: !house,
                                              commission: o.agentCommission,
                                              commissionStatus: o.commissionStatus,
                                              createdAt: o.createdAt.toISOString(),
                                              updatedAt: o.updatedAt.toISOString(),
                                              buyerName: o.buyerName,
                                              buyerPhone: o.buyerPhone,
                                              costPrice: o.costPrice,
                                              providerCode: o.providerCode,
                                              providerOrderId: o.providerOrderId,
                                              providerStatus: o.providerStatus,
                                              providerMessage: o.providerMessage,
                                            } satisfies OrderView
                                          }
                                          adminForms={{
                                            retry: retryDataOrder,
                                            refresh: refreshDataOrderStatus,
                                            markRefunded: markDataOrderRefunded,
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <Suspense fallback={<div className="h-12" />}>
                            <OrderPager page={page} pageCount={pageCount} perPage={perPage} />
                          </Suspense>
                        </>
                      )}
                    </>
                  )}
                </Panel>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="The account" icon={UserRound} subtitle={`/store/${agent.slug}`}>
                    <dl className="divide-y divide-niki-edge text-sm">
                      <Line label="Owner" value={agent.user?.name ?? "—"} />
                      <Line label="Email" value={agent.user?.email ?? "—"} />
                      <Line
                        label="Phone"
                        value={
                          <span className="font-mono">
                            {agent.supportPhone || agent.user?.phone || "—"}
                          </span>
                        }
                      />
                      <Line
                        label="Signs in"
                        value={agent.user?.canSignIn ? "Yes" : "Never signed in"}
                      />
                      <Line label="Storefront" value={agent.storeOpen ? "Open" : "Closed"} />
                      <Line
                        label="AFA"
                        value={
                          agent.afaEnabled
                            ? agent.afaPrice > 0
                              ? formatMoney(agent.afaPrice)
                              : "At Nickimart's price"
                            : "Off"
                        }
                      />
                      <Line label="Orders" value={String(orderCount)} />
                      <Line label="Recruits" value={String(recruits.length)} />
                    </dl>
                  </Panel>

                  {/*
                    The registration, in full. Somebody has to be able to answer
                    "why did this agent pay GH₵30 when the fee is GH₵50, and who
                    got the rest?" months later, and a single number cannot.
                  */}
                  <Panel title="Registration" icon={ReceiptText} subtitle={settledLabel}>
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-niki-ink/60">Registration fee</dt>
                        <dd className="font-figures font-semibold text-niki-ink">
                          {formatMoney(fee.gross)}
                        </dd>
                      </div>
                      {fee.waived > 0 ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-niki-ink/60">
                            Waiver
                            <span className="ml-1 text-xs text-niki-ink/40">
                              {fee.waiverPercent}%
                            </span>
                          </dt>
                          <dd className="font-figures font-semibold text-niki-success">
                            −{formatMoney(fee.waived)}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-baseline justify-between gap-3 border-t border-niki-edge pt-2">
                        <dt className="font-medium text-niki-ink">
                          {agent.setupFeeMethod === "UPFRONT"
                            ? "Payable up front"
                            : "Deducted from commission"}
                        </dt>
                        <dd className="font-figures font-bold text-niki-ink">
                          {formatMoney(fee.payable)}
                        </dd>
                      </div>
                      {fee.payable > 0 ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-niki-ink/60">Paid so far</dt>
                          <dd className="font-figures font-semibold text-niki-ink">
                            {formatMoney(fee.payable - wallet.outstandingSetup)}
                          </dd>
                        </div>
                      ) : null}
                      {fee.referrerShare > 0 ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-niki-ink/60">
                            Credited to {referrer?.storeName ?? "their recruiter"}
                          </dt>
                          <dd className="font-figures font-semibold text-niki-ink">
                            {formatMoney(fee.referrerShare)}
                          </dd>
                        </div>
                      ) : null}
                      {fee.payable > 0 ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-niki-ink/60">Nickimart keeps</dt>
                          <dd className="font-figures font-semibold text-niki-ink">
                            {formatMoney(fee.nickimartKeeps)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <p className="mt-3 text-xs text-niki-ink/45">
                      {agent.setupFeeSettledBy === "ADJUSTMENT"
                        ? `Settled ${formatWhen(agent.setupFeePaidAt!)} by an admin credit rather than a payment, so their recruiter earned nothing on it.`
                        : agent.setupFeePaidAt
                          ? `Settled ${formatWhen(agent.setupFeePaidAt)}. The recruiter's reward and share are released on payment.`
                          : agent.setupFeeMethod === "UPFRONT"
                            ? "Their storefront stays closed to customers until this clears."
                            : "Clearing itself out of the commission they earn."}
                    </p>
                  </Panel>
                </div>
              </div>
            ),
          },
          {
            key: "wallet",
            label: "Wallet",
            badge: pendingTopups.length,
            content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <Panel title="Ledger" icon={Wallet} subtitle="Every cedi in and out, most recent first.">
                    {ledger.length === 0 ? (
                      <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                        Nothing posted yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-niki-edge">
                        {ledger.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-niki-ink">
                                {ledgerTypeLabel(e.type)}
                              </p>
                              <p className="truncate text-xs text-niki-ink/55">{e.narration}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p
                                className={cn(
                                  "text-sm font-semibold",
                                  e.amount < 0 ? "text-niki-danger" : "text-niki-success",
                                )}
                              >
                                {e.amount < 0 ? "−" : "+"}
                                {formatMoney(Math.abs(e.amount))}
                              </p>
                              <p className="text-[11px] text-niki-ink/40">
                                {formatWhen(e.createdAt)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>

                  <Panel title="Withdrawals" icon={Receipt}>
                    {withdrawals.length === 0 ? (
                      <p className="text-sm text-niki-ink/55">None yet.</p>
                    ) : (
                      <ul className="divide-y divide-niki-edge">
                        {withdrawals.map((w) => (
                          <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div>
                              <p className="text-sm font-semibold text-niki-ink">
                                {formatMoney(w.amount)}
                              </p>
                              <p className="font-mono text-[11px] text-niki-ink/45">
                                {w.momoPhone}
                              </p>
                            </div>
                            <span className="text-[11px] font-semibold uppercase text-niki-ink/55">
                              {w.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>

                <div className="space-y-4">
                  <BalanceAdjuster agentId={agent.id} />
                  <TopupReconciler
                    agentId={agent.id}
                    pending={pendingTopups.map((t) => ({
                      reference: t.reference,
                      amount: t.amount,
                    }))}
                  />
                </div>
              </div>
            ),
          },
          {
            key: "recruiting",
            label: "Recruiting",
            badge: recruits.length,
            content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <Panel
                  title="Their team"
                  icon={Users}
                  subtitle={`${recruits.length} ${recruits.length === 1 ? "agent" : "agents"} registered under ${agent.code}`}
                >
                  {recruits.length === 0 ? (
                    <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                      They haven&apos;t recruited anybody yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-niki-edge">
                      {recruits.map((r) => (
                        <li key={r.id}>
                          <ActionLink
                            href={`/admin/data/agents/${r.id}`}
                            className="niki-focus flex items-center justify-between gap-3 py-3 hover:text-niki-orange"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-niki-ink">
                                {r.storeName}
                              </p>
                              <p className="font-mono text-[11px] text-niki-ink/45">
                                {r.code} · joined {formatWhen(r.createdAt)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                                r.setupFeeSettledBy === "ADJUSTMENT"
                                  ? "bg-amber-100 text-amber-800"
                                  : r.setupFeePaidAt
                                    ? "bg-niki-success/10 text-niki-success"
                                    : "bg-niki-ink/10 text-niki-ink/55",
                              )}
                            >
                              {r.setupFeeSettledBy === "ADJUSTMENT"
                                ? "Written off"
                                : r.setupFeePaidAt
                                  ? "Settled"
                                  : "Clearing"}
                            </span>
                          </ActionLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <div className="space-y-4">
                  <ReferrerTool
                    agentId={agent.id}
                    referrer={
                      referrer ? { code: referrer.code, storeName: referrer.storeName } : null
                    }
                    recruits={recruits.length}
                  />

                  <RecruitPaymentTool
                    agentId={agent.id}
                    mode={agent.recruitPaymentMode}
                    programMode={program.paymentMode}
                    allowed={program.perAgentOverrides}
                  />

                  <ReferralWaiverTool
                    agentId={agent.id}
                    waiverPercent={agent.referralWaiverPercent}
                    sharePercent={agent.referralSharePercent}
                    defaultPercent={referralConfig.waiverDefaultPercent}
                    defaultSharePercent={referralConfig.referrerSharePercent}
                    registrationFee={program.setupFee}
                  />

                  {/*
                    Read back from the database through the same resolution the
                    agent's own screen runs. A setting that saved but is not
                    being applied — an exception written while exceptions are
                    switched off, most of all — is otherwise invisible from
                    here, and looks to everybody like a bug in the form.
                  */}
                  <div
                    className={cn(
                      "rounded-xl px-4 py-3 text-xs",
                      rule.source === "ignored" || rule.source === "unreadable"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-niki-surface text-niki-ink/60",
                    )}
                  >
                    <p className="font-semibold text-niki-ink">In force right now</p>
                    <p className="mt-0.5">
                      People joining with {agent.code}{" "}
                      {rule.mode === "UPFRONT"
                        ? "must pay their registration up front."
                        : rule.mode === "COMMISSION"
                          ? "clear their registration out of commission."
                          : "choose how to settle their registration."}
                    </p>
                    <p className="mt-1">
                      {rule.source === "agent"
                        ? "From this agent's own exception."
                        : rule.source === "ignored"
                          ? "Their exception is being ignored — per-agent exceptions are switched off under Programme settings, so the programme rule applies."
                          : rule.source === "unreadable"
                            ? "Their exception couldn't be read, so the programme rule applies. The database may be missing the latest migration — anything saved here won't take effect until it is."
                            : "From the programme rule; this agent has no exception."}
                    </p>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: "settings",
            label: "Account",
            content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <AgentAccountTools
                  agentId={agent.id}
                  origin={siteUrl()}
                  initial={{
                    storeName: agent.storeName,
                    slug: agent.slug,
                    storeTagline: agent.storeTagline ?? "",
                    storeAbout: agent.storeAbout ?? "",
                    supportPhone: agent.supportPhone ?? "",
                    supportWhatsapp: agent.supportWhatsapp ?? "",
                    whatsappGroup: agent.whatsappGroup ?? "",
                    storeOpen: agent.storeOpen,
                    status: agent.status,
                    afaEnabled: agent.afaEnabled,
                    afaPrice: agent.afaPrice,
                    ownerName: agent.user?.name ?? "",
                    ownerPhone: agent.user?.phone ?? "",
                    userId: agent.userId,
                  }}
                />

                {/* An agent whose account has no password has never been able
                    to sign in — the setup link either was never delivered or
                    has expired. */}
                {agent.user && !agent.user.canSignIn ? (
                  <SetupLinkTool agentId={agent.id} name={agent.user.name ?? agent.storeName} />
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
