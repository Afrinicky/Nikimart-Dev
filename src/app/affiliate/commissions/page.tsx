import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatDay, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  getAffiliateBalance,
  getCommissionRows,
  requireAffiliateConsole,
} from "@/lib/affiliate-console";
import { COMMISSION_STATUSES, COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Commissions — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [{ value: "all", label: "All commission" }, ...COMMISSION_STATUSES];

const RULE_LABELS: Record<string, string> = {
  product: "Set on the product",
  category: "Category rate",
  affiliate: "Your agreed rate",
  default: "Programme default",
};

/**
 * The commission ledger, exactly as the platform holds it.
 *
 * One row per order line, with the rate that was applied, who funded it, which
 * rule set it, where it stands and when it clears. This is the screen a
 * disagreement about money gets settled on, so nothing here is summarised or
 * rounded away: a partial reversal shows both the original amount and what was
 * taken back, and says why.
 */
export default async function AffiliateCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  const { affiliate, policy } = await requireAffiliateConsole();
  const params = await searchParams;

  const status = STATUS_OPTIONS.some((o) => o.value === params.status) ? params.status! : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, balance] = await Promise.all([
    getCommissionRows(affiliate.id, { status, q: query, page, perPage }),
    getAffiliateBalance(affiliate.id),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <ModuleHeader
        title="Commissions"
        subtitle={`One line per sale. Commission clears ${
          policy.returnWindowDays > 0
            ? `${policy.returnWindowDays} day${policy.returnWindowDays === 1 ? "" : "s"} after delivery`
            : "on delivery"
        }.`}
        icon={Receipt}
      >
        <Link
          href="/affiliate/earnings"
          className="niki-press rounded-lg bg-niki-orange px-4 py-2 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          Request a payout
        </Link>
      </ModuleHeader>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Earned" value={formatMoney(balance.earned)} />
        <StatCard
          label="Awaiting delivery"
          value={formatMoney(balance.pending)}
          href="/affiliate/commissions?status=pending"
        />
        <StatCard
          label="In return window"
          value={formatMoney(balance.clearing)}
          href="/affiliate/commissions?status=clearing"
        />
        <StatCard
          label="Payable"
          value={formatMoney(balance.cleared)}
          href="/affiliate/commissions?status=cleared"
        />
        <StatCard
          label="Reversed"
          value={formatMoney(balance.reversed)}
          href="/affiliate/commissions?status=reversed"
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by order number or product…"
            selects={[{ key: "status", label: "Filter by status", value: status, options: STATUS_OPTIONS }]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="commission lines"
            exportHref="/affiliate/commissions/export"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={["Order", "Product", "Qty", "Line value", "Rate", "Commission", "Funded by", "Rule", "Status", "Clears"]}
        minWidth={1280}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No commission lines match these filters."
      >
        {rows.map((r) => (
          <ConsoleRow key={r.id}>
            <td className={`${td} font-mono text-xs font-semibold text-niki-ink`}>{r.orderNumber}</td>
            <td className={`${td} max-w-[240px]`}>
              <Link
                href={`/affiliate/shop/${r.productSlug}`}
                className="line-clamp-2 font-semibold text-niki-ink hover:text-niki-orange"
              >
                {r.productName}
              </Link>
            </td>
            <td className={`${td} text-niki-ink/70`}>{r.quantity}</td>
            <td className={`${td} text-niki-ink/70`}>{formatPrice(r.baseAmount)}</td>
            <td className={`${td} font-semibold text-niki-ink`}>{r.rate}%</td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>
              {formatMoney(r.net)}
              {r.reversedAmount > 0 ? (
                <span
                  className="ml-1.5 text-[11px] font-medium text-niki-danger"
                  title={r.reversalReason || "Reversed"}
                >
                  −{formatMoney(r.reversedAmount)}
                </span>
              ) : null}
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>
              {r.fundedBy === "platform" ? "Nickimart" : r.fundedBy === "seller" ? "The shop" : "—"}
            </td>
            <td className={`${td} text-xs text-niki-ink/55`}>{RULE_LABELS[r.ruleSource] ?? r.ruleSource}</td>
            <td className={td}>
              <ConsolePill
                status={r.status}
                label={COMMISSION_STATUS_LABELS[r.status] ?? r.status}
                title={r.status === "reversed" ? r.reversalReason || undefined : undefined}
              />
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {r.status === "cleared" || r.status === "paid"
                ? formatDay(r.clearedAt)
                : r.holdUntil
                  ? formatDay(r.holdUntil)
                  : r.status === "pending"
                    ? "On delivery"
                    : "—"}
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs leading-relaxed text-niki-ink/50">
        Commission is held until the order has been delivered and its return window has closed, so a
        cancelled or returned order never leaves anybody paid for a sale that did not complete. A
        partial refund reduces the commission in proportion rather than voiding it. The rate, the
        funder and the rule that set them are snapshotted at the moment of sale — a later change to
        a product or to the programme cannot rewrite what you have already earned.
      </p>
      <p className="mt-2 text-xs text-niki-ink/50">
        Attribution runs for {policy.attributionWindowDays} days from the click
        {policy.attributionModel === "last" ? ", with the most recent link winning" : ", with the first link winning"}.
      </p>
    </div>
  );
}
