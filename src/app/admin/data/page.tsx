import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  ListOrdered,
  RefreshCw,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { formatPrice } from "@/lib/format";
import { getDataStats } from "@/lib/data-bundles/reporting";
import { getProviderBalance, isDataProviderConfigured, providerBase } from "@/lib/data-bundles/provider";
import { isPaymentConfigured } from "@/lib/payments";
import { isSmsConfigured } from "@/lib/notifications";
import { getDataStoreConfig } from "@/lib/settings";
import { getAllBundles } from "@/lib/data-bundles/catalog";
import { sweepDataOrders } from "@/lib/data-bundles/admin-actions";

export const metadata: Metadata = { title: "Data Bundles — Admin — NikiMart" };
export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "danger" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <div className="flex items-center gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-display text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

export default async function AdminDataOverviewPage() {
  const providerReady = isDataProviderConfigured();
  const [stats, balance, config, bundles] = await Promise.all([
    getDataStats(),
    providerReady ? getProviderBalance() : Promise.resolve({ balance: null, message: "Not configured" }),
    getDataStoreConfig(),
    getAllBundles(),
  ]);

  const activeBundles = bundles.filter((b) => b.isActive && b.price > 0).length;
  const missingCost = bundles.filter((b) => b.costPrice <= 0).length;

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
      ok: isPaymentConfigured(),
      label: "Paystack",
      detail: isPaymentConfigured()
        ? "Collecting real payments."
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

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">{config.name}</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {activeBundles} bundles on sale · store is{" "}
            <span className={config.enabled ? "font-semibold text-niki-success" : "font-semibold text-niki-danger"}>
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
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/5 transition-colors hover:bg-niki-navy/5"
            >
              <RefreshCw className="h-4 w-4" />
              Run checks now
            </button>
          </form>
          <Link
            href="/admin/data/bundles"
            className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Set bundle prices
          </Link>
        </div>
      </div>

      {/* Agent wallet — the balance every order is drawn from. */}
      <div className="mt-6 niki-gradient-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 text-white">
        <div>
          <div className="flex items-center gap-2 text-white/60">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Agent wallet balance</span>
          </div>
          <p className="mt-1 font-display text-3xl font-bold">
            {balance.balance === null ? "—" : formatPrice(balance.balance)}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {balance.balance === null
              ? balance.message
              : "Every bundle you sell is bought from this balance. Top it up on Justice Datashop."}
          </p>
        </div>
        <a
          href="https://justicedatashop.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/20 transition-colors hover:bg-white/20"
        >
          <ExternalLink className="h-4 w-4" />
          Top up
        </a>
      </div>

      {/* Trading figures */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={String(stats.todayOrders)} hint={`${formatPrice(stats.todayRevenue)} taken`} icon={ListOrdered} />
        <Stat label="In flight" value={String(stats.inFlight)} hint="Paid, waiting on the provider" icon={Clock3} tone="orange" />
        <Stat label="Delivered" value={String(stats.completed)} icon={CheckCircle2} tone="success" />
        <Stat label="Failed" value={String(stats.failed)} hint={stats.failed ? "Needs attention" : "All clear"} icon={XCircle} tone={stats.failed ? "danger" : "ink"} />
        <Stat label="Revenue" value={formatPrice(stats.revenue)} hint="All paid orders" icon={CircleDollarSign} />
        <Stat label="Provider cost" value={formatPrice(stats.cost)} hint="Charged to the agent wallet" icon={Wallet} />
        <Stat label="Gross margin" value={formatPrice(stats.profit)} hint={missingCost ? `${missingCost} bundles have no cost recorded` : "Revenue less provider cost"} icon={TrendingUp} tone="success" />
        <Stat label="Awaiting payment" value={String(stats.pendingPayment)} hint="Abandoned checkouts" icon={Clock3} />
      </div>

      {stats.failed > 0 ? (
        <Link
          href="/admin/data/orders?status=failed"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-niki-danger/10 px-5 py-4 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20 transition-colors hover:bg-niki-danger/15"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {stats.failed} {stats.failed === 1 ? "order" : "orders"} failed to deliver. Retry or refund them.
        </Link>
      ) : null}

      {stats.afaPending > 0 ? (
        <Link
          href="/admin/data/afa"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-medium text-niki-ink ring-1 ring-black/5 hover:bg-niki-navy/5"
        >
          <Clock3 className="h-5 w-5 shrink-0 text-niki-orange" />
          {stats.afaPending} AFA {stats.afaPending === 1 ? "registration is" : "registrations are"} awaiting approval.
        </Link>
      ) : null}

      {/* Setup checklist */}
      <section className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h2 className="font-display text-lg font-bold text-niki-ink">Setup</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
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
