import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { CommissionTool } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatDay, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import { getAdminCommissions } from "@/lib/affiliate-admin";
import { COMMISSION_STATUSES, COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate commissions — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [{ value: "all", label: "All commission" }, ...COMMISSION_STATUSES];

/**
 * Every commission the programme has accrued, one line per order line.
 *
 * This is the monitor: what is held, what has cleared, what has been paid, and
 * what was taken back. Reversals are done from here rather than by editing a
 * figure — a return, a refund or a correction leaves an adjustment record
 * naming the admin and the reason, so a number that changed can always be
 * explained a month later.
 */
export default async function AdminAffiliateCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = STATUS_OPTIONS.some((o) => o.value === params.status) ? params.status! : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [policy, { rows, total, totals }] = await Promise.all([
    getAffiliatePolicy(),
    getAdminCommissions({ status, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Commissions"
          subtitle={`Held until delivery, then ${
            policy.returnWindowDays > 0
              ? `${policy.returnWindowDays} day${policy.returnWindowDays === 1 ? "" : "s"} for returns`
              : "payable immediately"
          }.`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Earned" value={formatMoney(totals.earned)} />
        <StatCard
          label="Awaiting delivery"
          value={formatMoney(totals.pending)}
          href="/admin/affiliates/commissions?status=pending"
        />
        <StatCard
          label="In return window"
          value={formatMoney(totals.clearing)}
          href="/admin/affiliates/commissions?status=clearing"
        />
        <StatCard
          label="Payable"
          value={formatMoney(totals.cleared)}
          href="/admin/affiliates/payouts"
        />
        <StatCard
          label="Paid"
          value={formatMoney(totals.paid)}
          href="/admin/affiliates/commissions?status=paid"
        />
        <StatCard
          label="Reversed"
          value={formatMoney(totals.reversed)}
          href="/admin/affiliates/commissions?status=reversed"
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by order, product, affiliate or code…"
            selects={[{ key: "status", label: "Filter by status", value: status, options: STATUS_OPTIONS }]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="commission lines"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Order",
          "Affiliate",
          "Product",
          "Line value",
          "Rate",
          "Commission",
          "Funded by",
          "Order status",
          "Commission",
          "Clears",
          "Actions",
        ]}
        minWidth={1480}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No commission lines match these filters."
      >
        {rows.map((r) => (
          <ConsoleRow key={r.id}>
            <td className={`${td} font-mono text-xs font-semibold`}>
              <Link href={`/admin/orders/${r.orderId}`} className="text-niki-ink hover:text-niki-orange">
                {r.orderNumber}
              </Link>
              <span className="mt-0.5 block font-sans text-[10px] font-medium text-niki-ink/40">
                {formatWhen(r.createdAt)}
              </span>
            </td>
            <td className={td}>
              <Link
                href={`/admin/affiliates/${r.affiliateId}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {r.affiliateName}
              </Link>
              <span className="block font-mono text-[11px] text-niki-orange">{r.affiliateCode}</span>
            </td>
            <td className={`${td} max-w-[220px] truncate text-xs text-niki-ink/65`} title={r.productName}>
              {r.productName}
              <span className="block text-[10px] text-niki-ink/40">× {r.quantity}</span>
            </td>
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
            <td className={td}>
              <ConsolePill status={r.orderStatus} label={ORDER_STATUS_LABELS[r.orderStatus] ?? r.orderStatus} />
            </td>
            <td className={td}>
              <ConsolePill
                status={r.status}
                label={COMMISSION_STATUS_LABELS[r.status] ?? r.status}
                title={r.reversalReason || undefined}
              />
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {r.holdUntil ? formatDay(r.holdUntil) : r.status === "pending" ? "On delivery" : "—"}
            </td>
            <td className={td}>
              <CommissionTool
                id={r.id}
                status={r.status}
                lineValue={r.baseAmount.toFixed(2)}
                reversed={r.reversedAmount > 0}
              />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs leading-relaxed text-niki-ink/50">
        Cancelling an order reverses its commission automatically. Use the controls here for a
        return or a refund after the fact: a partial refund takes back its share in proportion, and
        a reversal made in error can be undone. Every change leaves an adjustment record naming who
        made it and why.
      </p>
    </Container>
  );
}
