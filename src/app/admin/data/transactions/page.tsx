import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, Repeat } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { TransactionsTable } from "@/components/admin/TransactionsTable";
import { Receipt } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { getTransactions } from "@/lib/data-bundles/transactions";
import {
  FLOW_OPTIONS,
  kindOptions,
  RANGE_OPTIONS,
  transactionRange,
} from "@/lib/transaction-kinds";

export const metadata: Metadata = { title: "Transactions — Admin — Nickimart" };
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
  tone: "success" | "danger" | "ink";
}) {
  const tones = {
    success: "text-niki-success",
    danger: "text-niki-danger",
    ink: "text-niki-ink",
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
 * Every movement of money in the bundle business, in one place.
 *
 * The figures were always there — an order here, a top-up there, a ledger
 * entry somewhere else — but never together, so "what happened to the money on
 * Tuesday" meant opening four screens and adding up by hand.
 *
 * Every row leads to the thing it is: an order to the orders table filtered to
 * its reference, a payout to that payout, anything on an agent's balance to
 * that agent's window. A ledger you cannot click through is a ledger you have
 * to take on trust.
 */
export default async function AdminDataTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    flow?: string;
    range?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const kinds = kindOptions("data");
  const kind = kinds.some((k) => k.value === params.kind) ? params.kind! : "all";
  const flow = FLOW_OPTIONS.some((f) => f.value === params.flow) ? params.flow! : "all";
  const days = transactionRange(params.range);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, totals } = await getTransactions({
    kind,
    flow,
    days,
    query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const windowLabel =
    RANGE_OPTIONS.find((r) => r.value === String(days))?.label.toLowerCase() ?? "this window";

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Transactions"
        subtitle="Every cedi in and out of the bundle business, from the rows it actually happened on."
        icon={Receipt}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Money in"
          value={formatMoney(totals.in)}
          note={`Sales, top-ups and fees · ${windowLabel}`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <Tile
          label="Money out"
          value={formatMoney(totals.out)}
          note={`Payouts and refunds · ${windowLabel}`}
          icon={ArrowUpRight}
          tone="danger"
        />
        <Tile
          label="Moved inside"
          value={formatMoney(totals.internal)}
          note="Commission, referrals and adjustments"
          icon={Repeat}
          tone="ink"
        />
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by reference, name or number…"
            searchLabel="Search transactions"
            filters={[
              { key: "kind", label: "Filter by kind", value: kind, options: kinds },
              { key: "flow", label: "Filter by direction", value: flow, options: FLOW_OPTIONS },
              { key: "range", label: "Period", value: String(days), options: RANGE_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="transactions"
            exportHref="/admin/data/transactions/export"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <TransactionsTable
          rows={rows}
          emptyHint={
            query || kind !== "all" || flow !== "all"
              ? "Nothing matches those filters. Try widening the period."
              : "Nothing has moved yet."
          }
        />
        {rows.length > 0 ? (
          <Suspense fallback={<div className="h-12" />}>
            <TablePager page={page} pageCount={pageCount} perPage={perPage} />
          </Suspense>
        ) : null}
      </section>
    </Container>
  );
}
