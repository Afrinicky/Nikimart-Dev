import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Gift,
  PiggyBank,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { TablePager } from "@/components/admin/TablePager";
import { TableFilters } from "@/components/admin/TableFilters";
import { StagePill } from "@/components/admin/retail/StagePill";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney, formatPrice } from "@/lib/format";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import {
  FULFILMENT_COLOUR,
  FULFILMENT_FILTER_OPTIONS,
  FULFILMENT_LABELS,
  isFulfilmentStage,
  type FulfilmentStage,
} from "@/lib/retail/fulfilment";
import {
  economicsByShop,
  economicsSeries,
  getOrderEconomics,
  sumEconomics,
} from "@/lib/retail/economics";

export const metadata: Metadata = { title: "Order economics — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

const SOURCE_OPTIONS = [
  { value: "all", label: "All orders" },
  { value: "imported", label: "Bought from a supplier" },
  { value: "stock", label: "Sold from a shop's stock" },
  { value: "affiliate", label: "Referred by an affiliate" },
] as const;

/**
 * What each order made.
 *
 * The ledger beside this one says what moved; it cannot say what was earned,
 * because the answer is a subtraction across three tables. An imported line is
 * bought from a supplier and resold, and what it made is the gap between the
 * two — a gap that only exists on the record of the purchase. A shop's line is
 * never bought at all, so its cost and its selling price are the same figure
 * and the income is the commission snapshotted on it at sale time.
 *
 * Both are here as one column each, so a month's trading reconciles to a
 * number rather than to a feeling. The affiliate is shown separately from the
 * net, because what they earned and what it cost Nickimart are not the same
 * thing where the shop funds it.
 */
export default async function OrderEconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    stage?: string;
    source?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  // The month, like every other console that reports on trading.
  const period = resolveWindow(params, new Date(), { fallback: "month" });
  const stage = isFulfilmentStage(params.stage ?? "") ? params.stage! : "all";
  const source = SOURCE_OPTIONS.some((o) => o.value === params.source) ? params.source! : "all";
  const query = (params.q ?? "").trim().toLowerCase();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const all = await getOrderEconomics(period);

  // The totals, the chart and the splits describe the window; the table
  // describes the filters on top of it. Two figures rather than one, because
  // "showing 4 of 180" has to be true of something.
  const totals = sumEconomics(all);
  const series = economicsSeries(all, period);
  const shops = economicsByShop(all);

  let rows = all;
  if (stage !== "all") rows = rows.filter((r) => r.stage === stage);
  if (source === "imported") rows = rows.filter((r) => r.purchases.length > 0);
  if (source === "stock") rows = rows.filter((r) => r.purchases.length === 0);
  if (source === "affiliate") rows = rows.filter((r) => r.affiliate > 0);
  if (query) {
    rows = rows.filter((r) =>
      `${r.orderNumber} ${r.buyerName} ${r.affiliateName} ${r.shopNames.join(" ")} ${r.purchases
        .map((p) => p.reference)
        .join(" ")}`
        .toLowerCase()
        .includes(query),
    );
  }

  const filtered = sumEconomics(rows);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const shown = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

  const mix = new Map<FulfilmentStage, number>();
  for (const r of all) mix.set(r.stage, (mix.get(r.stage) ?? 0) + 1);
  const stageSlices = [...mix]
    .filter(([, n]) => n > 0)
    .map(([key, count]) => ({
      key,
      label: FULFILMENT_LABELS[key],
      count,
      colour: FULFILMENT_COLOUR[key],
      href: `/admin/finance/orders?stage=${key}`,
    }));

  const stageOptions = FULFILMENT_FILTER_OPTIONS.map((o) => {
    const n = o.value === "all" ? all.length : (mix.get(o.value as FulfilmentStage) ?? 0);
    return n > 0 ? { ...o, label: `${o.label} (${n})` } : o;
  });

  const windowLabel = period.label;

  return (
    <Container className="py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">
            Order economics
          </h2>
          <p className="mt-0.5 text-sm text-niki-ink/60">
            What each order sold for, what the goods cost, and what was left · {windowLabel}
          </p>
        </div>
        {/* Suspense because the pills build their links off the query string. */}
        <Suspense fallback={<div className="h-9" />}>
          <OverviewRange
            active={period.key}
            label={period.label}
            from={period.from}
            to={period.to}
            basePath="/admin/finance/orders"
          />
        </Suspense>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Tile
          label="Sold"
          value={formatPrice(totals.selling)}
          note={`${totals.orders} order${totals.orders === 1 ? "" : "s"} · ${windowLabel}`}
          icon={TrendingUp}
          href="/admin/orders"
        />
        <Tile
          label="Cost of goods"
          value={formatPrice(totals.cost)}
          note="Suppliers, and shops' own stock"
          icon={ShoppingBag}
          href="/admin/orders/placement"
        />
        <Tile
          label="Gross income"
          value={formatPrice(totals.gross)}
          note={totals.selling > 0 ? `${totals.margin}% of what was sold` : "Before affiliates"}
          icon={PiggyBank}
          tone="success"
        />
        <Tile
          label="Affiliate commission"
          value={formatPrice(totals.affiliate)}
          note={
            totals.affiliateCost > 0
              ? `${formatPrice(totals.affiliateCost)} of it funded by Nickimart`
              : "All funded by the shops"
          }
          icon={Gift}
          href="/admin/affiliates/commissions"
        />
        <Tile
          label="Net income"
          value={formatPrice(totals.net)}
          note="After what Nickimart funds of the commission"
          icon={Wallet}
          tone="success"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">Income</h3>
            <p className="text-xs text-niki-ink/55">
              {formatPrice(totals.gross)} gross, {formatPrice(totals.net)} net · {windowLabel}
            </p>
          </div>
          <TrendChart
            points={series.map((d) => ({
              day: d.day,
              endDay: d.endDay,
              value: d.net,
              label: formatPrice(d.net),
              count: d.orders,
              // Clicking a point narrows the whole tab onto it, so the table
              // below is the orders that made that figure.
              href: `/admin/finance/orders?from=${d.day}&to=${d.endDay ?? d.day}`,
            }))}
            countLabel="orders"
          />
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">Where orders are</h3>
            <p className="text-xs text-niki-ink/55">
              Money is only earned once the buyer has it · {windowLabel}
            </p>
          </div>
          <StatusBar slices={stageSlices} />
        </section>
      </div>

      <div className="mt-4">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-niki-ink">Net income by shop</h3>
              <p className="text-xs text-niki-ink/55">
                What each shop&apos;s goods were worth to Nickimart · {windowLabel}
              </p>
            </div>
            <ActionLink
              href="/admin/vendors"
              className="shrink-0 text-xs font-semibold text-niki-trust hover:underline"
            >
              All shops
            </ActionLink>
          </div>
          <BarList
            rows={shops.slice(0, 8).map((s) => ({
              key: s.key,
              label: s.label,
              value: s.net,
              note: `${formatPrice(s.selling)} sold · ${s.orders} order${s.orders === 1 ? "" : "s"}`,
            }))}
            format={formatPrice}
            empty="No orders in this window."
          />
        </section>
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={params.q ?? ""}
            searchPlaceholder="Search by order, buyer, shop, affiliate or purchase…"
            searchLabel="Search orders"
            filters={[
              { key: "stage", label: "Filter by status", value: stage, options: stageOptions },
              { key: "source", label: "Filter by source", value: source, options: [...SOURCE_OPTIONS] },
            ]}
            shown={shown.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="orders"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-niki-ink/50">
            No orders match these filters.
          </p>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>Order</th>
                    <th className={th}>Buyer &amp; shop</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Sold for</th>
                    <th className={`${th} text-right`}>Cost</th>
                    <th className={`${th} text-right`}>Gross</th>
                    <th className={`${th} text-right`}>Affiliate</th>
                    <th className={`${th} rounded-r-xl text-right`}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                    >
                      <td className={td}>
                        <ActionLink
                          href={`/admin/orders/${r.id}`}
                          className="font-mono text-xs font-semibold text-niki-ink hover:text-niki-orange"
                        >
                          {r.orderNumber}
                        </ActionLink>
                        <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                          {r.createdAt.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {r.imported ? " · imported" : ""}
                        </span>
                      </td>

                      <td className={td}>
                        <span className="block max-w-[12rem] truncate text-niki-ink/80" title={r.buyerName}>
                          {r.buyerName}
                        </span>
                        <span className="mt-0.5 block max-w-[12rem] truncate text-[11px] text-niki-ink/40">
                          {r.shopNames.join(", ") || "—"}
                          {r.affiliateName ? ` · via ${r.affiliateName}` : ""}
                        </span>
                      </td>

                      <td className={td}>
                        <StagePill stage={r.stage} />
                        {r.purchases.length > 0 ? (
                          <span className="mt-1 block">
                            {r.purchases.map((p) => (
                              <ActionLink
                                key={p.id}
                                href={`/admin/orders/placement/purchase/${p.id}`}
                                className="mr-1 inline-flex font-mono text-[10px] font-semibold text-niki-trust hover:underline"
                              >
                                {p.reference}
                              </ActionLink>
                            ))}
                          </span>
                        ) : null}
                      </td>

                      <td className={`${td} text-right font-figures font-semibold text-niki-ink`}>
                        {formatMoney(r.selling)}
                        {r.shipping > 0 ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-niki-ink/40">
                            +{formatMoney(r.shipping)} shipping
                          </span>
                        ) : null}
                      </td>

                      <td className={`${td} text-right font-figures text-niki-ink/70`}>
                        {formatMoney(r.cost)}
                      </td>

                      <td className={`${td} text-right font-figures font-semibold text-niki-ink`}>
                        {formatMoney(r.gross)}
                      </td>

                      <td className={`${td} text-right font-figures text-niki-ink/70`}>
                        {r.affiliate > 0 ? formatMoney(r.affiliate) : <span className="text-niki-ink/30">—</span>}
                        {r.affiliateCost > 0 && r.affiliateCost !== r.affiliate ? (
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            {formatMoney(r.affiliateCost)} ours
                          </span>
                        ) : null}
                      </td>

                      <td
                        className={`${td} text-right font-figures font-bold ${
                          r.net >= 0 ? "text-niki-success" : "text-niki-danger"
                        }`}
                      >
                        {formatMoney(r.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-niki-surface/70">
                    <td className={`${td} rounded-l-xl text-xs font-semibold text-niki-ink/60`} colSpan={3}>
                      {total === all.length
                        ? `All ${total} order${total === 1 ? "" : "s"} · ${windowLabel}`
                        : `${total} of ${all.length} orders match`}
                    </td>
                    <td className={`${td} text-right font-figures font-bold text-niki-ink`}>
                      {formatMoney(filtered.selling)}
                    </td>
                    <td className={`${td} text-right font-figures text-niki-ink/70`}>
                      {formatMoney(filtered.cost)}
                    </td>
                    <td className={`${td} text-right font-figures font-bold text-niki-ink`}>
                      {formatMoney(filtered.gross)}
                    </td>
                    <td className={`${td} text-right font-figures text-niki-ink/70`}>
                      {formatMoney(filtered.affiliate)}
                    </td>
                    <td className={`${td} rounded-r-xl text-right font-figures font-bold text-niki-success`}>
                      {formatMoney(filtered.net)}
                    </td>
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
  tone?: "ink" | "success";
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p
        className={`mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl ${
          tone === "success" ? "text-niki-success" : "text-niki-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-niki-ink/45 sm:text-xs">{note}</p>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-5">{body}</div>
    );
  }
  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-5"
    >
      {body}
    </ActionLink>
  );
}
