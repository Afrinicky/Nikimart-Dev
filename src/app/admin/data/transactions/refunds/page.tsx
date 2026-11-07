import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Smartphone, Wallet } from "lucide-react";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { RefundsTable, type RefundTableRow } from "@/components/admin/RefundsTable";
import { formatMoney } from "@/lib/format";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { RANGE_OPTIONS, transactionRange } from "@/lib/transaction-kinds";
import {
  getOrderRefunds,
  getRefundTotals,
  REFUND_DESTINATION_OPTIONS,
  REFUND_STATUS_OPTIONS,
} from "@/lib/data-bundles/refund-reports";
import { markRefundSentAdmin } from "@/lib/data-bundles/refund-admin-actions";

export const metadata: Metadata = { title: "Refunds — Transactions — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone: "ink" | "gold" | "danger";
}) {
  const tones = {
    ink: "text-niki-ink",
    gold: "text-amber-700",
    danger: "text-niki-danger",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-figures text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-[11px] text-niki-ink/45">{note}</p>
    </div>
  );
}

/**
 * Every refund, and the ones still owed.
 *
 * Refunds were the one movement of money with nowhere to look them up. A
 * wallet credit at least left a ledger row; a refund owed to a buyer on MoMo
 * leaves none by definition, because the cedis go out by hand. So the figure
 * that matters most on this screen is the one nothing else could answer —
 * what Nickimart has promised a buyer and not yet sent.
 */
export default async function AdminDataRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    destination?: string;
    state?: string;
    range?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const destination = REFUND_DESTINATION_OPTIONS.some((o) => o.value === params.destination)
    ? params.destination!
    : "all";
  const state = REFUND_STATUS_OPTIONS.some((o) => o.value === params.state)
    ? params.state!
    : "all";
  const days = transactionRange(params.range);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total, available }, totals] = await Promise.all([
    getOrderRefunds({ destination, status: state, days, query, page, perPage }),
    getRefundTotals(days),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const windowLabel =
    RANGE_OPTIONS.find((r) => r.value === String(days))?.label.toLowerCase() ?? "this window";

  const tableRows: RefundTableRow[] = rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    amount: r.amount,
    destination: r.destination,
    status: r.status,
    momoPhone: r.momoPhone,
    momoName: r.momoName,
    momoNetwork: r.momoNetwork,
    requestedBy: r.requestedBy,
    requestedByName: r.requestedByName,
    note: r.note,
    paidBy: r.paidBy,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    agentName: r.agentName,
    agentCode: r.agentCode,
    network: r.network,
    sizeGb: r.sizeGb,
    recipientPhone: r.recipientPhone,
  }));

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Owed to buyers"
          value={formatMoney(totals.owed)}
          note={
            totals.owedCount === 0
              ? "Nothing awaiting transfer"
              : `${totals.owedCount} awaiting transfer · all time`
          }
          icon={Clock}
          tone="gold"
        />
        <Tile
          label="Back to wallets"
          value={formatMoney(totals.toWallets)}
          note={`${totals.toWalletsCount} credited · ${windowLabel}`}
          icon={Wallet}
          tone="ink"
        />
        <Tile
          label="Sent to buyers"
          value={formatMoney(totals.toBuyers)}
          note={`${totals.toBuyersCount} transferred · ${windowLabel}`}
          icon={Smartphone}
          tone="danger"
        />
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by reference, agent or number…"
            searchLabel="Search refunds"
            filters={[
              {
                key: "destination",
                label: "Filter by destination",
                value: destination,
                options: [...REFUND_DESTINATION_OPTIONS],
              },
              {
                key: "state",
                label: "Filter by state",
                value: state,
                options: [...REFUND_STATUS_OPTIONS],
              },
              { key: "range", label: "Period", value: String(days), options: RANGE_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="refunds"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <RefundsTable
          rows={tableRows}
          markSent={markRefundSentAdmin}
          emptyHint={
            !available
              ? "Tables not migrated on this database yet."
              : query || destination !== "all" || state !== "all"
                ? "Nothing matches those filters. Try widening the period."
                : "No order has been refunded yet."
          }
        />
        {rows.length > 0 ? (
          <Suspense fallback={<div className="h-12" />}>
            <TablePager page={page} pageCount={pageCount} perPage={perPage} />
          </Suspense>
        ) : null}
      </section>
    </>
  );
}
