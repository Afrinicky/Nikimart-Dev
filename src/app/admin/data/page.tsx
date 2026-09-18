import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
  ListOrdered,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { formatPrice } from "@/lib/format";
import { getDataStats } from "@/lib/data-bundles/reporting";
import {
  changePercent,
  getAgentPerformance,
  getDailySeries,
  getNetworkMix,
  getSourceMix,
  getStatusMix,
  getWindowTotals,
  overviewRange,
  OVERVIEW_RANGES,
} from "@/lib/data-bundles/overview";
import { getProviderBalance, isDataProviderConfigured, providerBase } from "@/lib/data-bundles/provider";
import { isPaymentConfigured } from "@/lib/payments";
import { emailStatus, isSmsConfigured } from "@/lib/notifications";
import { getDataStoreConfig } from "@/lib/data-bundles/settings";
import { getAllBundles } from "@/lib/data-bundles/catalog";
import { listAgents } from "@/lib/data-bundles/agents";
import { getWithdrawalTotals } from "@/lib/data-bundles/withdrawals";
import { sweepDataOrders } from "@/lib/data-bundles/admin-actions";
import { dataDb } from "@/lib/data-db";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Data Bundles — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The bundle business at a glance.
 *
 * Two things were wrong with what this used to be. Every figure was all-time,
 * and an all-time total only goes up — nothing on the screen could tell you
 * whether this week was better or worse than last. And nothing on it was a
 * link, so reading "8 failed" meant going and finding them yourself.
 *
 * So: everything is scoped to a window and compared against the window before
 * it, every number leads to the rows it was counted from, and the shape of the
 * business is drawn rather than listed — the same figures, but as something
 * you can read at a glance instead of arithmetic you have to do in your head.
 */

/** The reserved status colours, a step darker than the text tokens. A fill
 *  under 3:1 against white is not readable as a segment, whatever it looks
 *  like as a pill. */
const STATUS_COLOUR = {
  delivered: "#059669",
  inFlight: "#0284c7",
  queued: "#ff6a00",
  failed: "#dc2626",
  refunded: "#6b7280",
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
      className="niki-focus group block rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
    >
      <div className="flex items-center gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className={`font-figures text-2xl font-bold ${tones[tone]}`}>{value}</p>
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
      {hint ? <p className="mt-0.5 text-xs text-niki-ink/50">{hint}</p> : null}
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
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
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

export default async function AdminDataOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string }>;
}) {
  const days = overviewRange((await searchParams)?.days);
  const providerReady = isDataProviderConfigured();

  const [
    stats,
    balance,
    config,
    bundles,
    agents,
    pendingWithdrawals,
    openSupport,
    totals,
    series,
    networks,
    sources,
    statusMix,
    performance,
    payouts,
  ] = await Promise.all([
    getDataStats(),
    providerReady ? getProviderBalance() : Promise.resolve({ balance: null, message: "Not configured" }),
    getDataStoreConfig(),
    getAllBundles(),
    listAgents(),
    dataDb.dataAgentWithdrawal.count({ where: { status: "pending" } }).catch(() => 0),
    dataDb.dataSupportRequest.count({ where: { status: "open" } }).catch(() => 0),
    getWindowTotals(days),
    getDailySeries(days),
    getNetworkMix(days),
    getSourceMix(days),
    getStatusMix(days),
    getAgentPerformance(days),
    getWithdrawalTotals(),
  ]);

  const activeBundles = bundles.filter((b) => b.isActive && b.price > 0).length;
  const missingCost = bundles.filter((b) => b.costPrice <= 0).length;
  // Bundles with no agent price are invisible to agents, so a full ladder with
  // none set means a recruited agent lands on an empty store.
  const missingAgentPrice = bundles.filter((b) => b.isActive && b.agentPrice <= 0).length;
  const agentSales = agents.reduce((sum, a) => sum + a.totalSales, 0);
  const owedToAgents = agents.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const activeAgents = agents.filter((a) => a.status === "active").length;

  const windowLabel = days === 7 ? "last 7 days" : days === 30 ? "last 30 days" : "last 90 days";

  const statusSlices = [
    {
      key: "completed",
      label: "Delivered",
      count: statusMix.completed ?? 0,
      colour: STATUS_COLOUR.delivered,
      href: "/admin/data/orders?status=completed",
    },
    {
      key: "processing",
      label: "Processing",
      count: (statusMix.processing ?? 0) + (statusMix.paid ?? 0),
      colour: STATUS_COLOUR.inFlight,
      href: "/admin/data/orders?status=processing",
    },
    {
      key: "queued",
      label: "Queued",
      count: statusMix.queued ?? 0,
      colour: STATUS_COLOUR.queued,
      href: "/admin/data/orders?status=queued",
    },
    {
      key: "failed",
      label: "Failed",
      count: statusMix.failed ?? 0,
      colour: STATUS_COLOUR.failed,
      href: "/admin/data/orders?status=failed",
    },
    {
      key: "refunded",
      label: "Cancelled & refunded",
      count: statusMix.refunded ?? 0,
      colour: STATUS_COLOUR.refunded,
      href: "/admin/data/orders?status=refunded",
    },
  ];

  const checks = [
    {
      // A key being *present* proves nothing — the provider still has to accept
      // it. The balance call above already asked, so use its answer rather than
      // reporting a green tick over a key that gets rejected on every order.
      ok: providerReady && balance.balance !== null,
      label: "Justice Datashop API key",
      detail: !providerReady
        ? "Set JUSTICE_API_KEY so paid orders can be fulfilled."
        : balance.balance !== null
          ? `Working — connected to ${providerBase()}`
          : `Key rejected by the provider: “${balance.message}”. Re-copy it from ` +
            "justicedatashop.com → Developer → Authentication (no quotes, no spaces), " +
            "update it in Vercel, and redeploy.",
    },
    {
      // The bundle business has its own Paystack account, and this console
      // reports on that one only — the mall's key is the retail console's
      // business.
      ok: isPaymentConfigured("data"),
      label: "Paystack (data bundles)",
      detail: isPaymentConfigured("data")
        ? "Collecting real payments into the data-bundle account."
        : "Set PAYSTACK_SECRET_KEY — until then orders settle without charging.",
    },
    {
      ok: isSmsConfigured(),
      label: "Arkesel SMS",
      detail: isSmsConfigured()
        ? "Buyers get a text when their bundle lands."
        : "Set ARKESEL_API_KEY to text buyers their receipts.",
    },
    {
      // Green only when a customer would actually receive it: a key alone still
      // reaches nobody on Resend's sandbox sender. Settings has the full story
      // and a test send.
      ok: emailStatus().deliverable,
      label: "Resend email",
      detail: emailStatus().deliverable
        ? `Buyers are emailed their receipts from ${emailStatus().from}.`
        : `${emailStatus().detail} Check it under Admin → Settings.`,
    },
    {
      // Derived from AUTH_SECRET, which the app can't run without — so this is
      // green on any working deployment and needs no setup.
      ok: Boolean((process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)?.trim()),
      label: "Provider status callback",
      detail: "Orders update themselves when the provider finishes. Nothing to configure.",
    },
    {
      ok: stats.available,
      label: "Database tables",
      detail: stats.available
        ? `${bundles.length} bundle rows stored.`
        : "Run nikimart-neon-data-bundles.sql on the database.",
    },
  ];

  const attention = [
    stats.failed > 0
      ? {
          key: "failed",
          href: "/admin/data/orders?status=failed",
          tone: "danger" as const,
          icon: AlertTriangle,
          text: `${stats.failed} ${stats.failed === 1 ? "order" : "orders"} failed to deliver. Retry or refund them.`,
        }
      : null,
    pendingWithdrawals > 0
      ? {
          key: "withdrawals",
          href: "/admin/data/withdrawals",
          tone: "warn" as const,
          icon: Banknote,
          text: `${pendingWithdrawals} agent ${pendingWithdrawals === 1 ? "withdrawal is" : "withdrawals are"} waiting to be sent on MoMo.`,
        }
      : null,
    openSupport > 0
      ? {
          key: "support",
          href: "/admin/data/support",
          tone: "plain" as const,
          icon: LifeBuoy,
          text: `${openSupport} agent ${openSupport === 1 ? "is" : "are"} waiting on a callback.`,
        }
      : null,
    stats.afaPending > 0
      ? {
          key: "afa",
          href: "/admin/data/afa",
          tone: "plain" as const,
          icon: BadgeCheck,
          text: `${stats.afaPending} AFA ${stats.afaPending === 1 ? "registration is" : "registrations are"} awaiting approval.`,
        }
      : null,
    missingAgentPrice > 0
      ? {
          key: "agent-price",
          href: "/admin/data/bundles",
          tone: "warn" as const,
          icon: AlertTriangle,
          text: `${missingAgentPrice} bundles on sale have no agent price, so agents can't resell them.`,
        }
      : null,
  ].filter(Boolean);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">{config.name}</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {activeBundles} bundles on sale · store is{" "}
            <span
              className={
                config.enabled ? "font-semibold text-niki-success" : "font-semibold text-niki-danger"
              }
            >
              {config.enabled ? "open" : "closed"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The cron runs this daily; the button is for right after a top-up,
              when waiting until tomorrow for stalled orders isn't acceptable. */}
          <form action={sweepDataOrders}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge transition-colors hover:bg-niki-black/5"
            >
              <RefreshCw className="h-4 w-4" />
              Run checks now
            </button>
          </form>
          <Link
            href="/admin/data/bundles"
            className="rounded-lg bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Set bundle prices
          </Link>
        </div>
      </div>

      {/* The wallet every order is bought from. */}
      <a
        href="https://justicedatashop.com"
        target="_blank"
        rel="noopener noreferrer"
        className="niki-gradient-card mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 text-white transition-opacity hover:opacity-95"
      >
        <div>
          <div className="flex items-center gap-2 text-white/60">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Provider wallet balance
            </span>
          </div>
          <p className="mt-1 font-figures text-3xl font-bold">
            {balance.balance === null ? "—" : formatPrice(balance.balance)}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {balance.balance === null
              ? balance.message
              : "Every bundle you sell is bought from this balance. Top it up on Justice Datashop."}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/20">
          <ExternalLink className="h-4 w-4" />
          Top up
        </span>
      </a>

      {/* The window everything below is measured over. */}
      <div className="mt-5 flex items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
          Showing
        </span>
        {OVERVIEW_RANGES.map((r) => (
          <ActionLink
            key={r}
            href={`/admin/data?days=${r}`}
            aria-current={r === days ? "page" : undefined}
            className={cn(
              "niki-focus rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              r === days
                ? "bg-niki-black text-white"
                : "bg-white text-niki-ink/60 ring-1 ring-niki-edge hover:text-niki-ink",
            )}
          >
            {r} days
          </ActionLink>
        ))}
      </div>

      {/* Trading, over the window. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue"
          value={formatPrice(totals.revenue)}
          hint={windowLabel}
          href="/admin/data/orders"
          icon={TrendingUp}
          delta={changePercent(totals.revenue, totals.previous.revenue)}
        />
        <Stat
          label="Orders"
          value={String(totals.orders)}
          hint={`${stats.todayOrders} today`}
          href="/admin/data/orders"
          icon={ListOrdered}
          delta={changePercent(totals.orders, totals.previous.orders)}
        />
        <Stat
          label="Gross margin"
          value={formatPrice(totals.margin)}
          hint={missingCost ? `${missingCost} bundles have no cost recorded` : "Revenue less provider cost"}
          href="/admin/data/bundles"
          icon={Wallet}
          tone="success"
        />
        <Stat
          label="Awaiting payment"
          value={String(stats.pendingPayment)}
          hint="Checkouts nobody finished"
          href="/admin/data/orders?status=pending"
          icon={ListOrdered}
        />
      </div>

      {attention.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {attention.map((a) =>
            a ? (
              <li key={a.key}>
                <ActionLink
                  href={a.href}
                  className={cn(
                    "niki-focus flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium transition-colors",
                    a.tone === "danger"
                      ? "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/20 hover:bg-niki-danger/15"
                      : a.tone === "warn"
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                        : "bg-white text-niki-ink ring-1 ring-niki-edge hover:bg-niki-black/5",
                  )}
                >
                  <a.icon className="h-5 w-5 shrink-0" />
                  {a.text}
                </ActionLink>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      {/* The shape of the window. */}
      <div className="mt-4">
        <Panel
          title="Revenue"
          subtitle={`${formatPrice(totals.revenue)} from ${totals.orders} paid orders · ${windowLabel}`}
          href="/admin/data/orders"
          linkLabel="All orders"
        >
          <TrendChart
            points={series.map((d) => ({
              day: d.day,
              value: d.revenue,
              label: formatPrice(d.revenue),
              count: d.orders,
            }))}
            countLabel="orders"
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Where orders end up" subtitle={windowLabel}>
          <StatusBar slices={statusSlices} />
        </Panel>

        <Panel title="Networks" subtitle="Revenue by network" href="/admin/data/orders">
          <BarList
            rows={networks.map((n) => ({
              key: n.key,
              label: n.label,
              value: n.revenue,
              note: `${n.orders} orders`,
              href: `/admin/data/orders?network=${encodeURIComponent(n.key)}`,
            }))}
            format={formatPrice}
            empty="No paid orders in this window."
          />
        </Panel>

        <Panel title="Where sales come from" subtitle="Revenue by channel">
          <BarList
            rows={sources.map((s) => ({
              key: s.key,
              label: s.label,
              value: s.revenue,
              note: `${s.orders} orders`,
              href: s.key === "WEB" ? "/admin/data/orders" : "/admin/data/agents",
            }))}
            format={formatPrice}
            empty="No paid orders in this window."
          />
        </Panel>
      </div>

      {/* The agent network. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Agents"
          value={String(agents.length)}
          hint={`${activeAgents} active · ${performance.sellingAgents} sold this window`}
          href="/admin/data/agents"
          icon={Users}
        />
        <Stat
          label="Agent sales"
          value={formatPrice(agentSales)}
          hint="All time, through agent storefronts"
          href="/admin/data/agents"
          icon={TrendingUp}
        />
        <Stat
          label="Owed to agents"
          value={formatPrice(owedToAgents)}
          hint="Commission they can withdraw"
          href="/admin/data/agents"
          icon={Wallet}
          tone={owedToAgents > 0 ? "orange" : "ink"}
        />
        <Stat
          label="Paid to agents"
          value={formatPrice(payouts.paid)}
          hint={
            payouts.pending > 0
              ? `${formatPrice(payouts.pending)} still to send`
              : `${payouts.paidCount} ${payouts.paidCount === 1 ? "payout" : "payouts"} sent on MoMo`
          }
          href="/admin/data/withdrawals?status=processed"
          icon={Banknote}
          tone="success"
        />
      </div>

      <div className="mt-4">
        <Panel
          title="Agent performance"
          subtitle={`Best selling agents · ${windowLabel}`}
          href="/admin/data/agents"
          linkLabel="All agents"
        >
          {performance.rows.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
              No agent sold anything in this window.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-12 gap-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40 sm:grid">
                <span className="col-span-5">Agent</span>
                <span className="col-span-2 text-right">Orders</span>
                <span className="col-span-2 text-right">Sales</span>
                <span className="col-span-2 text-right">Commission</span>
                <span className="col-span-1 text-right">Team</span>
              </div>
              <ul className="space-y-1">
                {performance.rows.map((a) => {
                  const share = a.sales / Math.max(performance.rows[0].sales, 1);
                  return (
                    <li key={a.id}>
                      <ActionLink
                        href={`/admin/data/agents/${a.id}`}
                        className="niki-focus block rounded-xl px-3 py-2.5 transition-colors hover:bg-niki-surface/70"
                      >
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-12 sm:items-center sm:gap-3">
                          <div className="min-w-0 sm:col-span-5">
                            <p className="truncate text-sm font-semibold text-niki-ink">
                              {a.storeName}
                            </p>
                            <p className="truncate font-mono text-[11px] text-niki-ink/40">
                              {a.code}
                              {a.ownerName ? ` · ${a.ownerName}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs sm:col-span-7 sm:grid sm:grid-cols-7 sm:text-sm">
                            <span className="text-niki-ink/60 sm:col-span-2 sm:text-right">
                              <span className="sm:hidden">Orders </span>
                              {a.orders}
                            </span>
                            <span className="font-figures font-bold text-niki-ink sm:col-span-2 sm:text-right">
                              {formatPrice(a.sales)}
                            </span>
                            <span className="text-niki-ink/60 sm:col-span-2 sm:text-right">
                              {formatPrice(a.commission)}
                              <span className="ml-1 sm:hidden">commission</span>
                            </span>
                            <span className="text-niki-ink/45 sm:col-span-1 sm:text-right">
                              {a.recruits}
                              <span className="ml-1 sm:hidden">team</span>
                            </span>
                          </div>
                        </div>
                        {/* The bar is the ranking made visible — the figures are
                            all printed, so it adds shape rather than data. */}
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
      </div>

      {/* Setup checklist */}
      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <h2 className="font-display font-bold text-niki-ink">Setup</h2>
        <p className="text-xs text-niki-ink/55">
          What the storefront needs before it can take real orders.
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
