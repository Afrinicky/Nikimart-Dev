import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Store, Wallet } from "lucide-react";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { TransactionsTable } from "@/components/admin/TransactionsTable";
import { formatMoney } from "@/lib/format";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { getTopups } from "@/lib/data-bundles/topups";
import {
  lastProviderReading,
  readAndRecordProviderBalance,
} from "@/lib/data-bundles/provider-ledger";
import { recordProviderReading } from "@/lib/data-bundles/admin-actions";
import { RANGE_OPTIONS, topupKindOptions, transactionRange } from "@/lib/transaction-kinds";
import { formatWhen } from "@/components/agent/AgentUi";

export const metadata: Metadata = { title: "Top-ups — Transactions — Admin — Nickimart" };
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
 * Every top-up, on both sides of the business.
 *
 * The ledger next door records Nickimart's own book. This records the two
 * floats that book is run on: the agents' balances, and the provider's wallet
 * that every bundle is bought from. The second of those happens on somebody
 * else's website, so until now nothing here could say what had been put into
 * it — or what had been spent out of it on orders placed there directly rather
 * than through this storefront.
 *
 * Both are recovered from readings of the provider's balance, which the daily
 * sweep takes and the button below takes on demand. What that cannot do is
 * separate two movements inside one interval: fund the wallet and buy from it
 * on the provider's site between two readings and only the net shows. A
 * reading taken either side of a funding is what makes it exact.
 */
export default async function AdminTopupLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; range?: string; q?: string; page?: string; per?: string }>;
}) {
  const params = await searchParams;
  const kinds = topupKindOptions();
  const kind = kinds.some((k) => k.value === params.kind) ? params.kind! : "all";
  const days = transactionRange(params.range);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  // Take a reading before the table is built, so opening this tab is itself
  // the refresh. Anything that moved on the provider's wallet since the last
  // reading is a row by the time the page renders, rather than something that
  // appears only after a button.
  await readAndRecordProviderBalance();

  const [{ rows, total, totals }, reading] = await Promise.all([
    getTopups({ kind, days, query, page, perPage }),
    lastProviderReading(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const windowLabel =
    RANGE_OPTIONS.find((r) => r.value === String(days))?.label.toLowerCase() ?? "this window";

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Agent top-ups"
          value={formatMoney(totals.agent)}
          note={`Onto agent floats · ${windowLabel}`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <Tile
          label="Provider funding"
          value={formatMoney(totals.providerFunding)}
          note={`Put into the provider wallet · ${windowLabel}`}
          icon={ArrowUpRight}
          tone="ink"
        />
        <Tile
          label="Spent outside Nickimart"
          value={formatMoney(totals.providerDebits)}
          note={`Orders placed on the provider's platform · ${windowLabel}`}
          icon={Store}
          tone="danger"
        />
        <Tile
          label="Provider balance"
          value={reading ? formatMoney(reading.balance) : "—"}
          note={reading ? `Read ${formatWhen(reading.createdAt)}` : "No reading taken yet"}
          icon={Wallet}
          tone="ink"
        />
      </div>

      <div className="mt-4 flex justify-end">
        {/* The sweep reads the wallet daily; this is for the minute after
            funding it, when the day's orders would otherwise net it off. */}
        <form action={recordProviderReading}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge transition-colors hover:bg-niki-black/5"
          >
            <RefreshCw className="h-4 w-4" />
            Record reading
          </button>
        </form>
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by reference, agent or detail…"
            searchLabel="Search top-ups"
            filters={[
              { key: "kind", label: "Filter by kind", value: kind, options: kinds },
              { key: "range", label: "Period", value: String(days), options: RANGE_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="top-ups"
            exportHref="/admin/data/transactions/topups/export"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <TransactionsTable
          rows={rows}
          emptyHint={
            query || kind !== "all"
              ? "Nothing matches those filters. Try widening the period."
              : "No top-up has been recorded yet."
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
