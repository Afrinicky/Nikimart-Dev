import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, Banknote, Clock, Hourglass, PiggyBank, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { SettlementRowActions } from "@/components/admin/retail/SettlementRowActions";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import {
  applyFilters,
  getPayoutSeries,
  getSettlements,
  SETTLEMENT_COLOUR,
  SETTLEMENT_LABELS,
  SETTLEMENT_SORT_OPTIONS,
  SETTLEMENT_STATUS_OPTIONS,
  SETTLEMENT_TONES,
  settlementSort,
  settlementStatusFilter,
  summarise,
  type SettlementState,
} from "@/lib/retail/settlements";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Seller settlements — Finance — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

/**
 * Who is owed what, and where it goes.
 *
 * Settling a seller used to be a figure on the finance page and a form two
 * clicks behind it. Nothing said who had been waiting longest, nothing showed
 * the MoMo number the money would go to, and nothing on the screen recorded
 * what had already been sent — so an admin paying ten shops held all of it in
 * their head and checked it afterwards.
 *
 * One row per shop now, with the whole position on it, and a window behind
 * each row where the payment is actually made. The row that cannot be paid —
 * a shop that never filled in its payout details — says so rather than
 * silently sitting at the bottom of the list.
 */
export default async function SellerSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    status?: string;
    sort?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const period = resolveWindow(params, new Date(), { fallback: "month" });
  const status = settlementStatusFilter(params.status);
  const sort = settlementSort(params.sort);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [all, series] = await Promise.all([getSettlements(), getPayoutSeries(period)]);

  const totals = summarise(all);
  const rows = applyFilters(all, { status, sort, query });
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const shown = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

  const mix = new Map<SettlementState, number>();
  for (const r of all) mix.set(r.state, (mix.get(r.state) ?? 0) + 1);
  const slices = [...mix]
    .filter(([, n]) => n > 0)
    .map(([key, count]) => ({
      key,
      label: SETTLEMENT_LABELS[key],
      count,
      colour: SETTLEMENT_COLOUR[key],
      href: `/admin/finance/settlements?status=${key}`,
    }));

  const statusOptions = SETTLEMENT_STATUS_OPTIONS.map((o) => {
    const n = o.value === "all" ? all.length : (mix.get(o.value as SettlementState) ?? 0);
    return n > 0 ? { ...o, label: `${o.label} (${n})` } : { ...o };
  });

  const owedBy = [...all]
    .filter((r) => r.earnings.available > 0)
    .sort((a, b) => b.earnings.available - a.earnings.available)
    .slice(0, 8);

  const paidInWindow = series.reduce((s, p) => s + p.amount, 0);
  const paidCount = series.reduce((s, p) => s + p.count, 0);

  return (
    <Container className="py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">
            Seller settlements
          </h2>
          <p className="mt-0.5 text-sm text-niki-ink/60">
            What every shop is owed, where it goes, and what has already been sent.
          </p>
        </div>
        {/* Suspense because the pills build their links off the query string. */}
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={period.key}
            label={period.label}
            from={period.from}
            to={period.to}
            basePath="/admin/finance/settlements"
          />
        </Suspense>
      </div>

      {totals.missingDetails > 0 ? (
        <ActionLink
          href="/admin/finance/settlements?status=nodetails"
          className="niki-focus group mt-4 flex items-center gap-2.5 rounded-2xl bg-niki-danger/[0.07] px-3 py-2.5 text-[13px] font-medium text-niki-danger ring-1 ring-niki-danger/20 transition-colors hover:bg-niki-danger/[0.12] sm:gap-3 sm:px-4 sm:py-3 sm:text-sm"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-niki-danger/15 sm:h-9 sm:w-9">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            {totals.missingDetails} shop{totals.missingDetails === 1 ? " has" : "s have"} money
            waiting and no payout details on file — the money cannot go anywhere until they add
            them.
          </span>
        </ActionLink>
      ) : null}

      {/* The position, unfiltered by date: a shop that cleared in February is
          still owed today. The payouts tile is the one flow among them. */}
      <section className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Tile
          label="Payable now"
          value={formatPrice(totals.payable)}
          note={`${totals.payableShops} shop${totals.payableShops === 1 ? "" : "s"} waiting`}
          icon={Wallet}
          tone={totals.payable > 0 ? "orange" : "ink"}
          href="/admin/finance/settlements?status=payable"
        />
        <Tile
          label="Requested"
          value={formatPrice(totals.requested)}
          note={`${totals.requestedShops} ${totals.requestedShops === 1 ? "request" : "requests"} to decide`}
          icon={Hourglass}
          tone={totals.requested > 0 ? "orange" : "ink"}
          href="/admin/finance/settlements?status=requested"
        />
        <Tile
          label="Held in escrow"
          value={formatPrice(totals.inEscrow)}
          note="On orders not yet delivered"
          icon={Clock}
          href="/admin/finance/settlements?status=holding"
        />
        <Tile
          label={`Paid · ${period.label}`}
          value={formatPrice(paidInWindow)}
          note={`${paidCount} payout${paidCount === 1 ? "" : "s"} sent`}
          icon={Banknote}
          tone="success"
        />
        <Tile
          label="Commission kept"
          value={formatPrice(totals.commission)}
          note={`On ${formatPrice(totals.gross)} of shop sales`}
          icon={PiggyBank}
          tone="success"
          href="/admin/finance/breakdown/commission"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">Paid to sellers</h3>
            <p className="text-xs text-niki-ink/55">
              Dated by when the money left · {period.label}
            </p>
          </div>
          <TrendChart
            points={series.map((d) => ({
              day: d.day,
              endDay: d.endDay,
              value: d.amount,
              label: formatPrice(d.amount),
              count: d.count,
              href: `/admin/finance/settlements?from=${d.day}&to=${d.endDay ?? d.day}`,
            }))}
            countLabel="payouts"
          />
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">Where shops stand</h3>
            <p className="text-xs text-niki-ink/55">Every shop that has traded</p>
          </div>
          <StatusBar slices={slices} />
        </section>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        <div className="mb-4">
          <h3 className="font-display font-bold text-niki-ink">Most owed</h3>
          <p className="text-xs text-niki-ink/55">Settle the top of this list first</p>
        </div>
        <BarList
          rows={owedBy.map((r) => ({
            key: r.id,
            label: r.businessName,
            value: r.earnings.available,
            note:
              r.waitingDays > 0
                ? `waiting ${r.waitingDays} day${r.waitingDays === 1 ? "" : "s"}`
                : r.payoutTarget || "no payout details",
            href: `/admin/finance/settlements/${r.id}`,
          }))}
          format={formatPrice}
          empty="Nothing is owed to any shop."
        />
      </section>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={params.q ?? ""}
            searchPlaceholder="Search by shop, owner, phone or payout number…"
            searchLabel="Search settlements"
            filters={[
              { key: "status", label: "Filter by state", value: status, options: statusOptions },
              { key: "sort", label: "Sort by", value: sort, options: [...SETTLEMENT_SORT_OPTIONS] },
            ]}
            shown={shown.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="shops"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-niki-ink/50">
            No shops match these filters.
          </p>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>Shop</th>
                    <th className={th}>Pay to</th>
                    <th className={`${th} text-right`}>Sold</th>
                    <th className={`${th} text-right`}>Commission</th>
                    <th className={`${th} text-right`}>Held</th>
                    <th className={`${th} text-right`}>Paid out</th>
                    <th className={`${th} text-right`}>Payable</th>
                    <th className={th}>State</th>
                    <th className={`${th} rounded-r-xl`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const wa = normalizeGhPhone(r.whatsapp || r.ownerPhone);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <ActionLink
                            href={`/admin/finance/settlements/${r.id}`}
                            className="block max-w-[12rem] truncate font-semibold text-niki-ink hover:text-niki-orange"
                            title={r.businessName}
                          >
                            {r.businessName}
                          </ActionLink>
                          <span className="mt-0.5 block max-w-[12rem] truncate text-[11px] text-niki-ink/45">
                            {r.ownerName || r.ownerEmail || "No owner linked"}
                          </span>
                        </td>

                        <td className={td}>
                          {r.payoutTarget ? (
                            <>
                              <span className="block font-mono text-[11px] font-semibold text-niki-ink/75">
                                {r.payoutTarget}
                              </span>
                              <span className="mt-0.5 block max-w-[10rem] truncate text-[11px] text-niki-ink/45">
                                {r.payoutMethod}
                                {r.payoutName ? ` · ${r.payoutName}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] font-semibold text-niki-danger">
                              Not set
                            </span>
                          )}
                        </td>

                        <td className={`${td} text-right font-figures text-niki-ink/75`}>
                          {formatPrice(r.earnings.gross)}
                        </td>
                        <td className={`${td} text-right font-figures text-niki-ink/60`}>
                          {formatPrice(r.earnings.commission)}
                        </td>
                        <td className={`${td} text-right font-figures text-niki-ink/60`}>
                          {r.earnings.inEscrow > 0 ? (
                            formatPrice(r.earnings.inEscrow)
                          ) : (
                            <span className="text-niki-ink/30">—</span>
                          )}
                        </td>
                        <td className={`${td} text-right font-figures text-niki-ink/60`}>
                          {formatPrice(r.earnings.paidOut)}
                          {r.lastPaidAt ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-niki-ink/40">
                              last{" "}
                              {r.lastPaidAt.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`${td} text-right font-figures font-bold ${
                            r.earnings.available > 0 ? "text-niki-orange" : "text-niki-ink/30"
                          }`}
                        >
                          {r.earnings.available > 0 ? formatPrice(r.earnings.available) : "—"}
                          {r.waitingDays > 0 ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-niki-ink/45">
                              {r.waitingDays} days
                            </span>
                          ) : null}
                        </td>

                        <td className={td}>
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              SETTLEMENT_TONES[r.state],
                            )}
                          >
                            {SETTLEMENT_LABELS[r.state]}
                          </span>
                        </td>

                        <td className={td}>
                          <SettlementRowActions
                            href={`/admin/finance/settlements/${r.id}`}
                            shopName={r.businessName}
                            phone={r.ownerPhone || undefined}
                            whatsapp={wa ?? undefined}
                            email={r.ownerEmail}
                            message={`Hello${r.ownerName ? ` ${r.ownerName.split(" ")[0]}` : ""}, about your Nickimart settlement for ${r.businessName}: `}
                            payable={r.earnings.available > 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-niki-surface/70">
                    <td className={`${td} rounded-l-xl text-xs font-semibold text-niki-ink/60`} colSpan={6}>
                      {total === all.length
                        ? `All ${total} shop${total === 1 ? "" : "s"}`
                        : `${total} of ${all.length} shops match`}
                    </td>
                    <td className={`${td} text-right font-figures font-bold text-niki-orange`}>
                      {formatPrice(rows.reduce((s, r) => s + r.earnings.available, 0))}
                    </td>
                    <td className={`${td} rounded-r-xl`} colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <Suspense fallback={<div className="h-12" />}>
              <TablePager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </>
        )}
      </section>
    </Container>
  );
}

function Tile({
  label,
  value,
  note,
  icon: Icon,
  href,
  tone = "ink",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  href?: string;
  tone?: "ink" | "success" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
  } as const;

  const body = (
    <>
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p className={`mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-niki-ink/45 sm:text-xs">{note}</p>
    </>
  );

  if (!href) return <div className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-5">{body}</div>;
  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-5"
    >
      {body}
    </ActionLink>
  );
}
