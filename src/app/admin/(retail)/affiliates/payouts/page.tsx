import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { PayoutDecision } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { requireDashboard } from "@/lib/session";
import { getAdminPayouts } from "@/lib/affiliate-admin";
import { PAYOUT_STATUS_OPTIONS } from "@/lib/affiliate-console";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate payouts — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const PAYOUT_LABELS: Record<string, string> = {
  pending: "Awaiting review",
  processing: "Processing",
  paid: "Paid",
  rejected: "Declined",
};

/**
 * The payout queue.
 *
 * Each request shows what the affiliate has cleared alongside what they asked
 * for, so a request can be checked without opening another screen. Marking one
 * paid settles the commission lines it claimed in the same transaction — which
 * is what stops the same commission being paid twice, since a line can only be
 * attached to one request.
 */
export default async function AdminAffiliatePayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = PAYOUT_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [policy, { rows, total, owed, awaiting }] = await Promise.all([
    getAffiliatePolicy(),
    getAdminPayouts({ status, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Payouts"
          subtitle={`Affiliates may request ${formatMoney(policy.minPayout)} or more, once their commission has cleared.`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting a decision" value={formatMoney(awaiting)} href="/admin/affiliates/payouts?status=pending" />
        <StatCard label="Cleared and unpaid" value={formatMoney(owed)} />
        <StatCard label="Requests shown" value={total.toLocaleString("en-GB")} />
        <StatCard label="Minimum payout" value={formatMoney(policy.minPayout)} href="/admin/affiliates/settings" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <ConsoleFilters
            query={query}
            searchPlaceholder="Search by affiliate, code or reference…"
            selects={[{ key: "status", label: "Filter by status", value: status, options: PAYOUT_STATUS_OPTIONS }]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="payout requests"
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Requested",
          "Affiliate",
          "Amount",
          "They have cleared",
          "Method",
          "Paid to",
          "Lines",
          "Status",
          "Reference",
          "Actions",
        ]}
        minWidth={1420}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty="No payout requests match these filters."
      >
        {rows.map((p) => (
          <ConsoleRow key={p.id}>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(p.createdAt)}
              {p.paidAt ? (
                <span className="mt-0.5 block text-[10px] text-niki-success">
                  paid {formatWhen(p.paidAt)}
                </span>
              ) : null}
            </td>
            <td className={td}>
              <Link
                href={`/admin/affiliates/${p.affiliateId}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {p.affiliateName}
              </Link>
              <span className="block font-mono text-[11px] text-niki-orange">{p.affiliateCode}</span>
            </td>
            <td className={`${td} font-figures font-bold text-niki-ink`}>{formatMoney(p.amount)}</td>
            <td
              className={`${td} font-figures font-bold ${
                p.payable + 0.005 >= p.amount ? "text-niki-success" : "text-niki-danger"
              }`}
              title={
                p.payable + 0.005 >= p.amount
                  ? "Covered by cleared commission"
                  : "More than this affiliate has cleared — check before paying"
              }
            >
              {formatMoney(p.payable)}
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>
              {p.method || "—"}
              {p.network ? <span className="block text-[10px] text-niki-ink/40">{p.network}</span> : null}
            </td>
            <td className={`${td} text-xs text-niki-ink/65`}>
              {p.accountNumber ? (
                <>
                  <span className="font-mono">{p.accountNumber}</span>
                  {p.accountName ? (
                    <span className="block text-[10px] text-niki-ink/45">{p.accountName}</span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </td>
            <td className={`${td} text-niki-ink/70`}>{p.lines || "—"}</td>
            <td className={td}>
              <ConsolePill
                status={p.status}
                label={PAYOUT_LABELS[p.status] ?? p.status}
                title={p.status === "rejected" ? p.rejectReason || undefined : p.note || undefined}
              />
            </td>
            <td className={`${td} font-mono text-[11px] text-niki-ink/45`}>{p.reference || "—"}</td>
            <td className={td}>
              <PayoutDecision id={p.id} status={p.status} amount={formatMoney(p.amount)} />
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 text-xs leading-relaxed text-niki-ink/50">
        Pay the affiliate by Mobile Money or transfer first, then record it here with the reference.
        Declining a request releases the commission it claimed, so the affiliate can ask again once
        whatever was wrong is sorted.
      </p>
    </Container>
  );
}
