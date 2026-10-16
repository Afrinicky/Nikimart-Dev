import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Hourglass,
  Radar,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { FulfilmentTabs } from "@/components/admin/retail/FulfilmentTabs";
import { TrackerRowActions } from "@/components/admin/retail/TrackerRowActions";
import { StagePill } from "@/components/admin/retail/StagePill";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { LiveOrders } from "@/components/data/LiveOrders";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { FULFILMENT_FILTER_OPTIONS, isFulfilmentStage } from "@/lib/retail/fulfilment";
import {
  getDeliveredHistory,
  getLiveTracker,
  humanDuration,
  SEVERITY_COLOUR,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  stageLoad,
  summarise,
  type Severity,
} from "@/lib/retail/tracker";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Order tracker — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

const SEVERITY_OPTIONS = [
  { value: "all", label: "Everything moving" },
  { value: "flagged", label: "Needs attention" },
  { value: "critical", label: "Badly late" },
  { value: "late", label: "Late" },
  { value: "watch", label: "Due soon" },
  { value: "ok", label: "On time" },
  { value: "done", label: "Collected" },
] as const;

/**
 * The clock on every order.
 *
 * The other two tabs say where an order is. Neither could say how long it had
 * been there, which is the only thing that turns a status into a job: "at the
 * freight forwarder" is fine on day two and a problem on day thirty, and an
 * order quietly stuck for six weeks looked exactly like one that moved
 * yesterday. The first anybody heard of it was the buyer.
 *
 * So every open order carries the time it has spent at its stage, the target
 * for that stage, and what it is past — the stage target, the supplier's own
 * promise, or the date the customer was given at checkout. That last one is
 * the expensive kind of late and is called out separately, because a
 * consignment can be inside every internal target and still have broken a
 * promise to somebody.
 *
 * Under the live board is the record: what finished orders actually took, by
 * stage, which is the only honest basis for the targets above and the only
 * figure that says whether the operation is getting faster.
 */
export default async function OrderTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    stage?: string;
    sev?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const period = resolveWindow(params, new Date(), { fallback: "month" });
  const stage = isFulfilmentStage(params.stage ?? "") ? params.stage! : "all";
  const sev = SEVERITY_OPTIONS.some((o) => o.value === params.sev) ? params.sev! : "all";
  const query = (params.q ?? "").trim().toLowerCase();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [live, history] = await Promise.all([getLiveTracker(), getDeliveredHistory(period)]);

  const summary = summarise(live);
  const load = stageLoad(live);

  let rows = live;
  if (sev === "done") rows = rows.filter((r) => r.stage === "collected");
  else if (sev === "flagged")
    rows = rows.filter((r) => r.stage !== "collected" && r.severity !== "ok");
  else if (sev !== "all")
    rows = rows.filter((r) => r.stage !== "collected" && r.severity === sev);
  else rows = rows.filter((r) => r.stage !== "collected");

  if (stage !== "all") rows = rows.filter((r) => r.stage === stage);
  if (query) {
    rows = rows.filter((r) =>
      `${r.orderNumber} ${r.buyerName} ${r.trackingNumber} ${r.destination} ${r.purchaseReference}`
        .toLowerCase()
        .includes(query),
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const shown = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

  const severitySlices = (["critical", "late", "watch", "ok"] as Severity[])
    .map((key) => ({
      key,
      label: SEVERITY_LABELS[key],
      count: summary[key === "ok" ? "onTime" : key],
      colour: SEVERITY_COLOUR[key],
      href: `/admin/orders/tracker?sev=${key}`,
    }))
    .filter((s) => s.count > 0);

  const stageOptions = FULFILMENT_FILTER_OPTIONS.map((o) => {
    if (o.value === "all") return o;
    const n = live.filter((r) => r.stage === o.value).length;
    return n > 0 ? { ...o, label: `${o.label} (${n})` } : o;
  });

  const faster =
    history.previousLeadDays !== null && history.averageLeadDays > 0
      ? history.averageLeadDays - history.previousLeadDays
      : null;

  const flagged = summary.critical + summary.late;

  return (
    <>
      <PageHeader
        title="Order fulfilment"
        subtitle="How long every order has been where it is, what it is past, and what finished orders actually take."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Order fulfilment" }]}
      />

      <Container className="space-y-4 py-6 sm:space-y-5 sm:py-8">
        {/* The board goes stale the moment somebody confirms a stage
            elsewhere, so it refreshes itself while it is being watched. */}
        <LiveOrders open={summary.open} seconds={45} />

        <FulfilmentTabs counts={{ "/admin/orders/tracker": flagged }} />

        {flagged > 0 ? (
          <ActionLink
            href="/admin/orders/tracker?sev=flagged"
            className="niki-focus group flex items-center gap-2.5 rounded-2xl bg-niki-danger/[0.07] px-3 py-2.5 text-[13px] font-medium text-niki-danger ring-1 ring-niki-danger/20 transition-colors hover:bg-niki-danger/[0.12] sm:gap-3 sm:px-4 sm:py-3 sm:text-sm"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9">
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-xl bg-niki-danger/30 opacity-40"
              />
              <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-niki-danger/15 sm:h-9 sm:w-9">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              {flagged} order{flagged === 1 ? " is" : "s are"} past a target
              {summary.pastEta > 0
                ? `, and ${summary.pastEta} ${summary.pastEta === 1 ? "is" : "are"} past the date the buyer was given`
                : ""}
              .
            </span>
          </ActionLink>
        ) : null}

        {/* The live board, unfiltered by date: an order placed in February
            that is still stuck is the most important row on this screen. */}
        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
          <Tile
            label="Still moving"
            value={String(summary.open)}
            note={`${summary.onTime} on time`}
            icon={Radar}
            href="/admin/orders/tracker"
          />
          <Tile
            label="Late"
            value={String(summary.late)}
            note="Past the target for their stage"
            icon={Clock}
            tone={summary.late > 0 ? "orange" : "ink"}
            href="/admin/orders/tracker?sev=late"
          />
          <Tile
            label="Badly late"
            value={String(summary.critical)}
            note="More than a fortnight over"
            icon={AlertTriangle}
            tone={summary.critical > 0 ? "danger" : "ink"}
            href="/admin/orders/tracker?sev=critical"
          />
          <Tile
            label="Past the buyer's date"
            value={String(summary.pastEta)}
            note="A promise already broken"
            icon={Hourglass}
            tone={summary.pastEta > 0 ? "danger" : "ink"}
            href="/admin/orders/tracker?sev=flagged"
          />
          <Tile
            label="Longest wait"
            value={humanDuration(summary.longestWaitMs)}
            note={summary.longestWaitOrder ? `Order ${summary.longestWaitOrder}` : "Nothing waiting"}
            icon={Timer}
            tone={summary.longestWaitMs > 30 * 86_400_000 ? "danger" : "ink"}
            href="/admin/orders/tracker?sev=flagged"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
            <div className="mb-4">
              <h2 className="font-display font-bold text-niki-ink">How the board reads</h2>
              <p className="text-xs text-niki-ink/55">Every order still moving, right now</p>
            </div>
            <StatusBar slices={severitySlices} />
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display font-bold text-niki-ink">Where the time goes</h2>
                <p className="text-xs text-niki-ink/55">
                  Average wait of the orders sitting at each stage now
                </p>
              </div>
            </div>
            <BarList
              rows={load.map((s) => ({
                key: s.key,
                label: s.label,
                value: Math.round((s.averageMs / 86_400_000) * 10) / 10,
                note: `${s.count} order${s.count === 1 ? "" : "s"}${
                  s.overdue > 0 ? ` · ${s.overdue} over target` : ""
                }`,
                href: `/admin/orders/tracker?stage=${s.key}`,
              }))}
              format={(v) => `${v} day${v === 1 ? "" : "s"}`}
              empty="Nothing is waiting anywhere."
            />
          </section>
        </div>

        {/* The record: what finished orders took. This half answers to the
            date picker; the board above it deliberately does not. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">
              What orders actually take
            </h2>
            <p className="mt-0.5 text-sm text-niki-ink/60">
              Measured from the orders handed over · {period.label}
            </p>
          </div>
          <Suspense fallback={<div className="h-9" />}>
            <OverviewRange
              active={period.key}
              label={period.label}
              from={period.from}
              to={period.to}
              basePath="/admin/orders/tracker"
            />
          </Suspense>
        </div>

        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <Tile
            label="Collected"
            value={String(history.delivered)}
            note={`Handed over · ${period.label}`}
            icon={CheckCircle2}
            tone="success"
            href="/admin/orders?stage=collected"
          />
          <Tile
            label="Average lead time"
            value={history.averageLeadDays > 0 ? `${history.averageLeadDays} days` : "—"}
            note="Order placed to buyer has it"
            icon={Gauge}
          />
          <Tile
            label="Against last period"
            value={
              faster === null
                ? "—"
                : `${faster <= 0 ? "" : "+"}${Math.round(faster * 10) / 10} days`
            }
            note={
              faster === null
                ? "Nothing to compare with"
                : faster <= 0
                  ? "Faster than the period before"
                  : "Slower than the period before"
            }
            icon={faster !== null && faster <= 0 ? TrendingDown : TrendingUp}
            tone={faster === null ? "ink" : faster <= 0 ? "success" : "danger"}
          />
          <Tile
            label="Average age"
            value={humanDuration(summary.averageAgeMs)}
            note="Of the orders still moving"
            icon={Hourglass}
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5 lg:col-span-2">
            <div className="mb-4">
              <h2 className="font-display font-bold text-niki-ink">Lead time</h2>
              <p className="text-xs text-niki-ink/55">
                Days from order to handover, by when it was handed over · {period.label}
              </p>
            </div>
            <TrendChart
              points={history.series.map((d) => ({
                day: d.day,
                endDay: d.endDay,
                value: d.days,
                label: `${d.days} days`,
                count: d.count,
                href: `/admin/orders/tracker?from=${d.day}&to=${d.endDay ?? d.day}`,
              }))}
              countLabel="collected"
            />
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
            <div className="mb-4">
              <h2 className="font-display font-bold text-niki-ink">Each leg, on average</h2>
              <p className="text-xs text-niki-ink/55">
                From the orders that got all the way through
              </p>
            </div>
            <BarList
              rows={history.byStage.map((s) => ({
                key: s.key,
                label: s.label,
                value: s.days,
              }))}
              format={(v) => `${v} day${v === 1 ? "" : "s"}`}
              empty="Nothing has been collected in this window."
            />
          </section>
        </div>

        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={params.q ?? ""}
            searchPlaceholder="Search by order, buyer, tracking number or destination…"
            searchLabel="Search tracked orders"
            filters={[
              { key: "sev", label: "Filter by urgency", value: sev, options: [...SEVERITY_OPTIONS] },
              { key: "stage", label: "Filter by stage", value: stage, options: stageOptions },
            ]}
            shown={shown.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="orders"
          />
        </Suspense>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-niki-ink/50">
              Nothing matches these filters — which, on the urgency ones, is good news.
            </p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-xl`}>Order</th>
                      <th className={th}>Stage</th>
                      <th className={th}>Time there</th>
                      <th className={th}>Target</th>
                      <th className={th}>Buyer&apos;s date</th>
                      <th className={th}>Urgency</th>
                      <th className={`${th} rounded-r-xl`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const wa = normalizeGhPhone(r.buyerPhone);
                      return (
                        <tr
                          key={r.id}
                          className={cn(
                            "border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50",
                            r.severity === "critical" && "bg-niki-danger/[0.04]",
                          )}
                        >
                          <td className={td}>
                            <ActionLink
                              href={`/admin/orders/${r.id}`}
                              className="font-mono text-xs font-semibold text-niki-ink hover:text-niki-orange"
                            >
                              {r.orderNumber}
                            </ActionLink>
                            <span className="mt-0.5 block max-w-[11rem] truncate text-[11px] text-niki-ink/45">
                              {r.buyerName}
                            </span>
                            <span className="mt-0.5 block max-w-[11rem] truncate text-[11px] text-niki-ink/35">
                              {r.destination}
                            </span>
                          </td>

                          <td className={td}>
                            <StagePill stage={r.stage} method={r.method} route={r.route} />
                            {r.purchaseReference ? (
                              <ActionLink
                                href={`/admin/orders/placement/purchase/${r.purchaseId}`}
                                className="mt-1 block font-mono text-[10px] font-semibold text-niki-trust hover:underline"
                              >
                                {r.purchaseReference}
                              </ActionLink>
                            ) : null}
                          </td>

                          <td className={td}>
                            <span className="font-figures font-semibold text-niki-ink">
                              {humanDuration(r.inStageMs)}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                              since{" "}
                              {r.stageSince.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })}
                              {" · "}
                              {humanDuration(r.totalMs)} old
                            </span>
                          </td>

                          <td className={td}>
                            <span className="text-xs text-niki-ink/70">
                              {r.targetDays > 0 ? `${r.targetDays} days` : "—"}
                            </span>
                            {r.overdueDays > 0 ? (
                              <span className="mt-0.5 block text-[11px] font-semibold text-niki-danger">
                                {r.overdueDays} over
                              </span>
                            ) : r.targetDays > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                                {Math.abs(r.overdueDays)} left
                              </span>
                            ) : null}
                          </td>

                          <td className={td}>
                            <span className="whitespace-nowrap text-xs text-niki-ink/70">
                              {r.eta
                                ? r.eta.toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                            {r.etaOverdueDays > 0 ? (
                              <span className="mt-0.5 block text-[11px] font-semibold text-niki-danger">
                                {r.etaOverdueDays} days past
                              </span>
                            ) : null}
                            {r.outstanding > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-niki-orange">
                                {formatPrice(r.outstanding)} due
                              </span>
                            ) : null}
                          </td>

                          <td className={td}>
                            <span
                              className={cn(
                                "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                SEVERITY_TONES[r.severity],
                              )}
                            >
                              {SEVERITY_LABELS[r.severity]}
                            </span>
                            {r.reason ? (
                              <span className="mt-1 block max-w-[14rem] text-[11px] text-niki-ink/50">
                                {r.reason}
                              </span>
                            ) : null}
                          </td>

                          <td className={td}>
                            <TrackerRowActions
                              href={`/admin/orders/${r.id}`}
                              orderNumber={r.orderNumber}
                              phone={r.buyerPhone || undefined}
                              whatsapp={wa ?? undefined}
                              email={r.buyerEmail}
                              message={`Hello ${r.buyerName.split(" ")[0]}, an update on your Nickimart order ${r.orderNumber}: `}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Suspense fallback={<div className="h-12" />}>
                <TablePager page={page} pageCount={pageCount} perPage={perPage} />
              </Suspense>
            </>
          )}
        </section>
      </Container>
    </>
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
  tone?: "ink" | "success" | "orange" | "danger";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
    danger: "text-niki-danger",
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
