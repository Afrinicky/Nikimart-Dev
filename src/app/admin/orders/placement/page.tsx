import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClock, CheckCircle2, Layers, Package, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { FulfilmentTabs } from "@/components/admin/retail/FulfilmentTabs";
import { TableFilters } from "@/components/admin/retail/TableFilters";
import {
  PlacementQueueTable,
  type QueueRowView,
} from "@/components/admin/retail/PlacementQueueTable";
import { PlacedPurchasesTable } from "@/components/admin/retail/PlacedPurchasesTable";
import { OrderPager } from "@/components/data/OrderPager";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/retail/orders";
import {
  PLACED_STATUS_OPTIONS,
  QUEUE_SORT_OPTIONS,
  QUEUE_STATUS_OPTIONS,
  getPlacedView,
  getQueueView,
  groupToken,
  placedStatusFilter,
  queueSort,
  queueStatusFilter,
  supplierKey,
} from "@/lib/retail/placement";

export const metadata: Metadata = { title: "Order placement — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * When to place the international orders, and the record of having placed them.
 *
 * A customer pays for one pair of shoes and no forwarder will ship one pair of
 * shoes. So the line waits for other lines going to the same supplier — a
 * supplier who sells shoes also sells bags — until the parcel clears the
 * forwarder's minimum for the lane it is travelling on. This screen is that
 * wait made visible.
 *
 * Two things it could not do before. It could not be filtered or paged, so a
 * busy queue was a wall; and it could only be worked a row at a time, which
 * meant two invoices to one supplier on one afternoon. Both are the same table
 * now as the rest of the console, and the rows that share a supplier can be
 * ticked and bought together.
 */
export default async function AdminOrderPlacementPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    q?: string;
    page?: string;
    per?: string;
    pstatus?: string;
    pq?: string;
    ppage?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = queueStatusFilter(params.status);
  const sort = queueSort(params.sort);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const placedStatus = placedStatusFilter(params.pstatus);
  const placedQuery = (params.pq ?? "").trim();
  const placedPage = Math.max(1, Number(params.ppage) || 1);

  const [queue, placed] = await Promise.all([
    getQueueView({ status, sort, query, page, perPage }),
    getPlacedView({ status: placedStatus, query: placedQuery, page: placedPage, perPage }),
  ]);

  const pageCount = Math.max(1, Math.ceil(queue.total / perPage));
  const placedPageCount = Math.max(1, Math.ceil(placed.total / perPage));

  const ready = queue.all.filter((g) => g.thresholdMet || g.scheduleDue);
  const due = queue.all.filter((g) => g.scheduleDue);
  const waitingCbm = Math.round(queue.all.reduce((s, g) => s + g.totalCbm, 0) * 1_000) / 1_000;
  const waitingValue = Math.round(queue.all.reduce((s, g) => s + g.goodsValue, 0) * 100) / 100;
  const awaitingForwarder = placed.all.filter((p) => p.status === "placed").length;

  const today = new Date();
  const rows: QueueRowView[] = queue.groups.map((g) => ({
    key: g.key,
    token: groupToken(g.key),
    supplierName: g.supplierName,
    supplierUrl: g.supplierUrl,
    supplierContact: g.supplierContact,
    supplierKey: supplierKey(g),
    vendorName: g.vendorName,
    forwarderName: g.forwarderName,
    forwarderId: g.forwarderId ?? "",
    routeId: g.routeId ?? "",
    routeLabel: g.routeLabel,
    destinationName: g.destinationName,
    minCbm: g.minCbm,
    totalCbm: g.totalCbm,
    totalUnits: g.totalUnits,
    goodsValue: g.goodsValue,
    thresholdMet: g.thresholdMet,
    scheduleDue: g.scheduleDue,
    schedule: g.schedule,
    dueAt: g.dueAt ? g.dueAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
    waitingSince: g.waitingSince.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    waitingDays: Math.max(
      0,
      Math.floor((today.getTime() - g.waitingSince.getTime()) / 86_400_000),
    ),
    lineCount: g.lines.length,
    orderCount: new Set(g.lines.map((l) => l.orderNumber)).size,
    itemIds: g.lines.map((l) => l.orderItemId),
  }));

  return (
    <>
      <PageHeader
        title="Order fulfilment"
        subtitle="What has been paid for, what is still waiting on volume, and what has been bought."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Order fulfilment" }]}
      />

      <Container className="space-y-5 py-8">
        <FulfilmentTabs counts={{ "/admin/orders/placement": queue.all.length }} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Ready to order"
            value={String(ready.length)}
            hint="Minimum reached or date due"
            href="/admin/orders/placement?status=ready"
            icon={CheckCircle2}
            tone={ready.length > 0 ? "success" : "ink"}
          />
          <Stat
            label="Suppliers waiting"
            value={String(queue.all.length)}
            hint="One row is one parcel"
            href="/admin/orders/placement"
            icon={Package}
          />
          <Stat
            label="Volume waiting"
            value={`${waitingCbm.toFixed(3)} m³`}
            hint={`${formatPrice(waitingValue)} of goods`}
            href="/admin/orders/placement?sort=volume"
            icon={Layers}
          />
          <Stat
            label="Scheduled dates due"
            value={String(due.length)}
            hint="The lane's ordering day has come"
            href="/admin/orders/placement?status=due"
            icon={CalendarClock}
            tone={due.length > 0 ? "orange" : "ink"}
          />
          <Stat
            label="With the supplier"
            value={String(awaitingForwarder)}
            hint="Bought, not yet at the forwarder"
            href="/admin/orders/placement?pstatus=placed"
            icon={Truck}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Waiting to be ordered</h2>
            <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
              One row is one supplier on one lane — the parcel that will be shipped. Tick the rows
              from a single supplier to buy them together under one reference, or open a row for
              the full picture and the lines it covers.
            </p>
          </div>

          <Suspense fallback={<div className="h-40" />}>
            <TableFilters
              query={query}
              searchPlaceholder="Search by supplier, shop, forwarder, product…"
              noun="suppliers"
              shown={queue.groups.length}
              total={queue.total}
              page={page}
              pageCount={pageCount}
              selects={[
                {
                  key: "status",
                  label: "Filter by readiness",
                  value: status,
                  options: [...QUEUE_STATUS_OPTIONS],
                },
                { key: "sort", label: "Sort by", value: sort, options: [...QUEUE_SORT_OPTIONS] },
              ]}
            />
          </Suspense>

          <PlacementQueueTable rows={rows} />

          <Suspense fallback={<div className="h-12" />}>
            <div className="rounded-2xl bg-white px-5 pb-5 ring-1 ring-niki-edge">
              <OrderPager page={page} pageCount={pageCount} perPage={perPage} />
            </div>
          </Suspense>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Orders placed</h2>
            <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
              Every purchase recorded with a supplier. Confirming the forwarder has a parcel moves
              every customer order it covers on to the next stage.
            </p>
          </div>

          <Suspense fallback={<div className="h-40" />}>
            <TableFilters
              query={placedQuery}
              queryKey="pq"
              searchPlaceholder="Search by reference, supplier, note…"
              noun="purchases"
              shown={placed.purchases.length}
              total={placed.total}
              page={placedPage}
              pageCount={placedPageCount}
              startOpen={false}
              selects={[
                {
                  key: "pstatus",
                  label: "Filter by status",
                  value: placedStatus,
                  options: [...PLACED_STATUS_OPTIONS],
                },
              ]}
            />
          </Suspense>

          <PlacedPurchasesTable purchases={placed.purchases} />

          <Suspense fallback={<div className="h-12" />}>
            <div className="rounded-2xl bg-white px-5 pb-5 ring-1 ring-niki-edge">
              <OrderPager
                page={placedPage}
                pageCount={placedPageCount}
                perPage={perPage}
                pageKey="ppage"
              />
            </div>
          </Suspense>
        </section>
      </Container>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
  } as const;

  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
    >
      <div className="flex items-center gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-figures text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-niki-ink/50">{hint}</p> : null}
    </ActionLink>
  );
}
