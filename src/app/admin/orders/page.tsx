import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, ClipboardList, PackageCheck, Ship, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { FulfilmentTabs } from "@/components/admin/retail/FulfilmentTabs";
import { TableFilters } from "@/components/admin/retail/TableFilters";
import { OrderRowActions } from "@/components/admin/retail/OrderRowActions";
import { PaymentPill, StagePill } from "@/components/admin/retail/StagePill";
import { OrderPager } from "@/components/data/OrderPager";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { requireDashboard } from "@/lib/session";
import { FULFILMENT_FILTER_OPTIONS } from "@/lib/retail/fulfilment";
import {
  METHOD_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  getFulfilmentOrders,
  getFulfilmentSummary,
  methodFilter,
  paymentFilter,
  perPageFrom,
  stageFilter,
} from "@/lib/retail/orders";

export const metadata: Metadata = { title: "Order fulfilment — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

/**
 * The order book.
 *
 * What this screen used to be: an order number, a total, and a dropdown. An
 * admin could tell you an order existed and what it cost, and could not tell
 * you who bought it, how to reach them, or where to send it — which is the one
 * thing the screen is for. A list of receipts, in other words, when what the
 * business needed was a worklist.
 *
 * So every row now carries the buyer, what they bought, what they have
 * actually paid, what is still outstanding and where the goods have got to;
 * and every row opens onto everything else there is. The stage is derived from
 * the purchase and the shipment rather than stored, so it moves the moment
 * either of them does.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    payment?: string;
    method?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const stage = stageFilter(params.stage);
  const payment = paymentFilter(params.payment);
  const method = methodFilter(params.method);
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ orders, total, counts }, summary] = await Promise.all([
    getFulfilmentOrders({ stage, payment, method, query, page, perPage }),
    getFulfilmentSummary(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // The stage dropdown says how many rows each option would show, for this
  // search — a filter that cannot tell you it leads nowhere is a dead end.
  const stageOptions = FULFILMENT_FILTER_OPTIONS.map((o) =>
    counts[o.value] ? { ...o, label: `${o.label} (${counts[o.value]})` } : o,
  );

  return (
    <>
      <PageHeader
        title="Order fulfilment"
        subtitle="Every order placed on the mall, who placed it, what is still owed on it, and what has to happen next."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Order fulfilment" }]}
      />

      <Container className="space-y-5 py-8">
        <FulfilmentTabs counts={{ "/admin/orders": summary.total, "/admin/orders/placement": summary.toPlace }} />

        {/* What is waiting on a person right now. Unfiltered on purpose: an
            order paid for in February is still somebody waiting today. */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Awaiting payment"
            value={String(summary.awaitingPayment)}
            hint="Checkouts nobody finished"
            href="/admin/orders?stage=awaiting_payment"
            icon={AlertTriangle}
            tone={summary.awaitingPayment > 0 ? "orange" : "ink"}
          />
          <Stat
            label="To be placed"
            value={String(summary.toPlace)}
            hint="Paid for, not yet bought"
            href="/admin/orders/placement"
            icon={ClipboardList}
            tone={summary.toPlace > 0 ? "orange" : "ink"}
          />
          <Stat
            label="On the way"
            value={String(summary.inTransit)}
            hint="Ordered, shipping or landed"
            href="/admin/orders?stage=in_transit"
            icon={Ship}
          />
          <Stat
            label="Ready for the buyer"
            value={String(summary.ready)}
            hint="Waiting to be collected"
            href="/admin/orders?stage=ready"
            icon={PackageCheck}
            tone={summary.ready > 0 ? "success" : "ink"}
          />
          <Stat
            label="Outstanding"
            value={formatPrice(summary.outstanding)}
            hint="Due from buyers on collection"
            href="/admin/orders?payment=part"
            icon={Wallet}
            tone={summary.outstanding > 0 ? "orange" : "ink"}
          />
        </section>

        {/* Suspense because the filter bar reads the query string. */}
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by order number, buyer, phone, product…"
            noun="orders"
            exportHref="/admin/export/orders"
            shown={orders.length}
            total={total}
            page={page}
            pageCount={pageCount}
            selects={[
              { key: "stage", label: "Filter by status", value: stage, options: stageOptions },
              {
                key: "payment",
                label: "Filter by payment",
                value: payment,
                options: [...PAYMENT_FILTER_OPTIONS],
              },
              {
                key: "method",
                label: "Filter by collection",
                value: method,
                options: [...METHOD_FILTER_OPTIONS],
              },
            ]}
          />
        </Suspense>

        {orders.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
            No orders match these filters.
          </p>
        ) : (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>Order ID</th>
                    <th className={th}>Buyer</th>
                    <th className={th}>Items</th>
                    <th className={th}>Ship to</th>
                    <th className={th}>Paid</th>
                    <th className={th}>Outstanding</th>
                    <th className={th}>Status</th>
                    <th className={th}>Date &amp; time</th>
                    <th className={`${th} rounded-r-xl`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const wa = normalizeGhPhone(o.buyerPhone);
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                      >
                        <td className={td}>
                          <ActionLink
                            href={`/admin/orders/${o.id}`}
                            className="font-mono text-xs font-semibold text-niki-ink hover:text-niki-orange"
                          >
                            {o.orderNumber}
                          </ActionLink>
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            {o.route === "abroad" ? "From abroad" : "Local"} ·{" "}
                            {o.deliveryMethod === "pickup" ? "Pickup" : "Delivery"}
                          </span>
                        </td>

                        <td className={td}>
                          <ActionLink
                            href={`/admin/orders/${o.id}`}
                            className="block max-w-[11rem] truncate font-semibold text-niki-ink hover:text-niki-orange"
                            title={o.buyerName}
                          >
                            {o.buyerName}
                          </ActionLink>
                          <span className="mt-0.5 block font-mono text-[11px] text-niki-ink/45">
                            {o.buyerPhone || o.buyerEmail}
                          </span>
                        </td>

                        <td className={td}>
                          <span
                            className="block max-w-[15rem] truncate text-niki-ink/80"
                            title={o.itemSummary}
                          >
                            {o.itemSummary}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            {o.units} unit{o.units === 1 ? "" : "s"}
                            {o.shopNames.length > 0 ? ` · ${o.shopNames.join(", ")}` : ""}
                            {o.affiliateName ? ` · via ${o.affiliateName}` : ""}
                          </span>
                        </td>

                        <td className={td}>
                          <span
                            className="block max-w-[12rem] truncate text-xs text-niki-ink/70"
                            title={o.destination}
                          >
                            {o.destination}
                          </span>
                        </td>

                        <td className={td}>
                          <span className="font-figures font-semibold text-niki-ink">
                            {formatPrice(o.amountPaid)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            of {formatPrice(o.total)}
                          </span>
                        </td>

                        <td className={td}>
                          {o.balanceDue > 0 ? (
                            <span className="font-figures font-semibold text-niki-orange">
                              {formatPrice(o.balanceDue)}
                            </span>
                          ) : (
                            <span className="text-niki-ink/35">—</span>
                          )}
                          <span className="mt-1 block">
                            <PaymentPill
                              total={o.total}
                              amountPaid={o.amountPaid}
                              balanceDue={o.balanceDue}
                            />
                          </span>
                        </td>

                        <td className={td}>
                          <StagePill
                            stage={o.stage}
                            method={o.deliveryMethod as "pickup" | "delivery"}
                            route={o.route}
                          />
                        </td>

                        <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                          {o.createdAt.toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className={td}>
                          <OrderRowActions
                            href={`/admin/orders/${o.id}`}
                            orderNumber={o.orderNumber}
                            phone={o.buyerPhone || undefined}
                            whatsapp={wa ?? undefined}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Suspense fallback={<div className="h-12" />}>
              <OrderPager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </div>
        )}
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
  tone?: "ink" | "success" | "danger" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
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
