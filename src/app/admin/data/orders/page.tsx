import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { NetworkCell, StatusPill } from "@/components/agent/AgentUi";
import { OrderActions, type OrderView } from "@/components/data/OrderActions";
import { OrderFilters } from "@/components/data/OrderFilters";
import { OrderPager } from "@/components/data/OrderPager";
import { formatMoney } from "@/lib/format";
import { bundleLabel } from "@/lib/data-bundles/networks";
import {
  ORDER_NETWORK_OPTIONS,
  ORDER_STATUS_OPTIONS,
  orderStatusFilter,
  perPageFrom,
} from "@/lib/data-bundles/order-filters";
import { getDataOrders, orderSourceLabel } from "@/lib/data-bundles/reporting";
import {
  markDataOrderRefunded,
  refreshDataOrderStatus,
  retryDataOrder,
} from "@/lib/data-bundles/admin-actions";

export const metadata: Metadata = { title: "Bundle Orders — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export default async function AdminDataOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    network?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const status = orderStatusFilter(params.status).value;
  const network = ORDER_NETWORK_OPTIONS.some((n) => n.value === params.network)
    ? params.network!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { orders, total, available } = await getDataOrders({
    status,
    network,
    query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const exportHref = `/admin/data/orders/export?${new URLSearchParams({
    status,
    network,
    q: query,
  }).toString()}`;

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">Bundle orders</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {available
              ? "View and manage every data bundle order."
              : "Tables not migrated yet"}
          </p>
        </div>
        {available && orders.length > 0 ? (
          <a
            href={exportHref}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-black/5"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        ) : null}
      </div>

      {available ? (
        <div className="mt-4">
          {/* Suspense because the filter bar reads the query string. */}
          <Suspense fallback={<div className="h-40" />}>
            <OrderFilters
              status={status}
              network={network}
              query={query}
              statusOptions={ORDER_STATUS_OPTIONS}
              networkOptions={ORDER_NETWORK_OPTIONS}
              shown={orders.length}
              total={total}
              page={page}
              pageCount={pageCount}
            />
          </Suspense>
        </div>
      ) : null}

      {!available ? (
        <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-800 ring-1 ring-amber-200">
          The data bundle tables aren&apos;t on this database yet. Run{" "}
          <code className="font-mono text-xs">nikimart-neon-data-bundles.sql</code> to create them.
        </p>
      ) : orders.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
          No orders match these filters.
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-niki-surface/70">
                  <th className={`${th} rounded-l-xl`}>Order ID</th>
                  <th className={th}>Source</th>
                  <th className={th}>Network</th>
                  <th className={th}>Size</th>
                  <th className={th}>Phone Number</th>
                  <th className={th}>Price</th>
                  <th className={th}>Status</th>
                  <th className={th}>Date</th>
                  <th className={`${th} rounded-r-xl`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const label = orderSourceLabel(o);
                  const house = o.source === "WEB" || !o.agentName;
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                    >
                      <td className={`${td} font-mono text-xs font-semibold text-niki-ink`}>
                        {o.reference}
                      </td>
                      <td className={`${td} text-xs`}>
                        <span
                          title={label}
                          className={
                            house
                              ? "inline-flex whitespace-nowrap rounded-full bg-niki-black/5 px-2.5 py-1 font-semibold text-niki-ink/70"
                              : "inline-flex whitespace-nowrap rounded-full bg-niki-orange/10 px-2.5 py-1 font-semibold text-niki-orange"
                          }
                        >
                          {house ? "Nickimart" : o.agentName}
                        </span>
                      </td>
                      <td className={td}>
                        <NetworkCell network={o.network} />
                      </td>
                      <td className={`${td} font-semibold text-niki-ink`}>
                        {bundleLabel(o.sizeGb)}
                      </td>
                      <td className={`${td} font-mono text-xs text-niki-ink/70`}>
                        {o.recipientPhone}
                      </td>
                      <td className={`${td} font-semibold text-niki-ink`}>
                        {formatMoney(o.price)}
                      </td>
                      <td className={td}>
                        <StatusPill status={o.status} />
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
                        <OrderActions
                          order={
                            {
                              id: o.id,
                              reference: o.reference,
                              network: o.network,
                              sizeGb: o.sizeGb,
                              recipientPhone: o.recipientPhone,
                              price: o.price,
                              status: o.status,
                              paymentStatus: o.paymentStatus,
                              sourceLabel: label,
                              commission: o.agentCommission,
                              commissionStatus: o.commissionStatus,
                              createdAt: o.createdAt.toISOString(),
                              updatedAt: o.updatedAt.toISOString(),
                              buyerName: o.buyerName,
                              buyerPhone: o.buyerPhone,
                              costPrice: o.costPrice,
                              providerCode: o.providerCode,
                              providerOrderId: o.providerOrderId,
                              providerStatus: o.providerStatus,
                              providerMessage: o.providerMessage,
                            } satisfies OrderView
                          }
                          adminForms={{
                            retry: retryDataOrder,
                            refresh: refreshDataOrderStatus,
                            markRefunded: markDataOrderRefunded,
                          }}
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
  );
}
