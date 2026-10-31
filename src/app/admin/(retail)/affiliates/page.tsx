import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StatCard } from "@/components/dashboard/StatCard";
import { ExportButton } from "@/components/admin/ExportButton";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { AffiliateStatusButton } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { requireDashboard } from "@/lib/session";
import { getAffiliateWindowOverview } from "@/lib/affiliate";
import {
  AFFILIATE_SOURCE_OPTIONS,
  AFFILIATE_STATUS_OPTIONS,
  getAffiliateRoster,
} from "@/lib/affiliate-admin";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliates — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Awaiting approval",
  suspended: "Suspended",
};

const SOURCE_LABELS: Record<string, string> = {
  self: "Applied",
  seller: "Seller",
  agent: "Bundle agent",
  admin: "Added by admin",
};

/**
 * The roster: everybody promoting Nickimart, and what each is worth.
 *
 * Rebuilt as a console table because the old version computed every
 * affiliate's earnings in a loop and rendered all of them on one page — fine
 * at twenty affiliates, a timeout at two thousand. Filtered, paged and
 * counted in grouped queries now, and showing the figures an admin actually
 * reconciles against: clicks, orders, commission, what is payable.
 *
 * The tiles above it answer to a date range, opening on the current month —
 * the stretch commission is reconciled over. Two of them deliberately do not,
 * and say so: how many affiliates are on the books, and what is owed to them,
 * are standing figures rather than flows.
 */
export default async function AdminAffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    source?: string;
    q?: string;
    page?: string;
    per?: string;
    days?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = AFFILIATE_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const source = AFFILIATE_SOURCE_OPTIONS.some((o) => o.value === params.source)
    ? params.source!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);
  const period = resolveWindow(params, new Date(), { fallback: "month" });

  const [overview, policy, { rows, total }] = await Promise.all([
    getAffiliateWindowOverview(period),
    getAffiliatePolicy(),
    getAffiliateRoster({ status, source, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      {!policy.enabled ? (
        <p className="mt-5 rounded-2xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
          The programme is switched off: no new attribution is being recorded. Commission already
          earned still clears and still pays.{" "}
          <Link href="/admin/affiliates/settings" className="font-semibold underline">
            Turn it back on
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-niki-ink/60">
          Default commission {policy.defaultRate}%, overridable per category, per product and per
          affiliate. Referrals are attributed for {policy.attributionWindowDays} days.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="affiliates" />
          <Link
            href="/admin/affiliates/new"
            className="flex items-center gap-2 rounded-lg bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" /> Add affiliate
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-niki-ink">The programme</h2>
          <p className="mt-0.5 text-sm text-niki-ink/60">
            What the affiliates referred and earned over the {period.label}.
          </p>
        </div>
        {/* Suspense because the pills build their links off the query string. */}
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={period.key}
            label={period.label}
            from={period.from}
            to={period.to}
            basePath="/admin/affiliates"
          />
        </Suspense>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label={`Affiliates · ${overview.joined} joined`}
          value={`${overview.active}/${overview.total} active`}
        />
        <StatCard
          label={`Referred sales · ${period.label}`}
          value={formatPrice(overview.referredSales)}
          href="/admin/finance/breakdown/gmv"
        />
        <StatCard
          label={`Commission earned · ${period.label}`}
          value={formatMoney(overview.commissionEarned)}
          href="/admin/affiliates/commissions"
        />
        <StatCard
          label={`Paid to affiliates · ${period.label}`}
          value={formatMoney(overview.paidOut)}
          href="/admin/affiliates/payouts"
        />
        <StatCard
          label="Owed · as it stands"
          value={formatMoney(overview.owed)}
          href="/admin/affiliates/payouts?status=pending"
        />
      </div>

      {/* Deliberately outside the date range: a request made in February is
          still somebody waiting today. */}
      {overview.pendingPayoutCount > 0 ? (
        <Link
          href="/admin/affiliates/payouts?status=pending"
          className="niki-focus group mt-3 flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
        >
          <span className="min-w-0 flex-1">
            {overview.pendingPayoutCount}{" "}
            {overview.pendingPayoutCount === 1 ? "affiliate is" : "affiliates are"} waiting on{" "}
            {formatMoney(overview.pendingPayouts)} in payouts.
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80" />
        </Link>
      ) : null}

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by name, code, email or phone…"
            selects={[
              { key: "status", label: "Filter by status", value: status, options: AFFILIATE_STATUS_OPTIONS },
              { key: "source", label: "Filter by source", value: source, options: AFFILIATE_SOURCE_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="affiliates"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Affiliate",
          "Code",
          "Source",
          "Status",
          "Products",
          "Clicks",
          "Orders",
          "Sales",
          "Commission",
          "Payable",
          "Actions",
        ]}
        minWidth={1340}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No affiliates match these filters. People join from the affiliate page, or you can add one here."
      >
        {rows.map((a) => (
          <ConsoleRow key={a.id}>
            <td className={td}>
              <Link
                href={`/admin/affiliates/${a.id}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {a.name}
              </Link>
              <p className="truncate text-[11px] text-niki-ink/45">
                {a.email || a.phone || "—"}
                {a.openFlags > 0 ? (
                  <Link
                    href={`/admin/affiliates/fraud?q=${encodeURIComponent(a.code || a.name)}`}
                    className="ml-1.5 font-semibold text-niki-danger hover:underline"
                  >
                    {a.openFlags} flag{a.openFlags === 1 ? "" : "s"}
                  </Link>
                ) : null}
              </p>
            </td>
            <td className={`${td} font-mono text-xs font-semibold text-niki-orange`}>
              {a.code || "—"}
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>
              {SOURCE_LABELS[a.source] ?? a.source}
              {a.isUser ? "" : " · no login"}
              <span className="mt-0.5 block text-[10px] text-niki-ink/35">
                joined {formatWhen(a.createdAt)}
              </span>
            </td>
            <td className={td}>
              <ConsolePill status={a.status} label={STATUS_LABELS[a.status] ?? a.status} />
            </td>
            <td className={`${td} text-niki-ink/70`}>{a.products}</td>
            <td className={`${td} text-niki-ink/70`}>{a.clicks.toLocaleString("en-GB")}</td>
            <td className={`${td} text-niki-ink/70`}>{a.orders}</td>
            <td className={`${td} text-niki-ink/70`}>{formatPrice(a.sales)}</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(a.earned)}</td>
            <td className={`${td} font-figures font-bold text-niki-success`}>
              {formatMoney(a.payable)}
            </td>
            <td className={td}>
              <div className="flex flex-wrap items-center gap-1.5">
                <AffiliateStatusButton id={a.id} status={a.status} />
                <Link
                  href={`/admin/affiliates/${a.id}`}
                  className="niki-press inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
                >
                  Manage <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>
    </Container>
  );
}
