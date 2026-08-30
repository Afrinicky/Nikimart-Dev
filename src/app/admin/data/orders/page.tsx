import type { Metadata } from "next";
import Link from "next/link";
import { Download, RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { FilterChip } from "@/components/admin/FilterChip";
import { PaymentPill, StatusPill } from "@/components/agent/AgentUi";
import { OrderActions, type OrderView } from "@/components/data/OrderActions";
import { formatMoney } from "@/lib/format";
import {
  DATA_ORDER_STATUSES,
  DATA_STATUS_LABELS,
  bundleLabel,
  networkLabel,
} from "@/lib/data-bundles/networks";
import {
  ORDERS_PER_PAGE,
  getDataOrders,
  orderSourceLabel,
} from "@/lib/data-bundles/reporting";
import {
  markDataOrderRefunded,
  refreshDataOrderStatus,
  retryDataOrder,
} from "@/lib/data-bundles/admin-actions";

export const metadata: Metadata = { title: "Bundle Orders — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function href(params: { status?: string; q?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/data/orders?${qs}` : "/admin/data/orders";
}

const iconAction =
  "niki-press inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-black/5";

export default async function AdminDataOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "all";
  const query = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const { orders, total, available } = await getDataOrders({ status, query, page });
  const pages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));

  const exportSp = new URLSearchParams();
  if (status !== "all") exportSp.set("status", status);
  if (query) exportSp.set("q", query);
  const exportHref = `/admin/data/orders/export${exportSp.toString() ? `?${exportSp}` : ""}`;

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">Bundle orders</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {available ? `${total} ${total === 1 ? "order" : "orders"}` : "Tables not migrated yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {available && orders.length > 0 ? (
            <a
              href={exportHref}
              className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-black/5"
            >
              <Download className="h-4 w-4" />
              Export
            </a>
          ) : null}
          <form action="/admin/data/orders" className="flex gap-2">
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
            <input
              name="q"
              defaultValue={query}
              placeholder="Reference or phone"
              className="rounded-xl border border-niki-edge-strong bg-white px-4 py-2 text-sm outline-none focus:border-niki-orange"
            />
            <button
              type="submit"
              className="rounded-xl bg-niki-black px-4 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip href={href({ q: query })} label="All" active={status === "all"} />
        {DATA_ORDER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={href({ status: s, q: query })}
            label={DATA_STATUS_LABELS[s]}
            active={status === s}
          />
        ))}
      </div>

      {!available ? (
        <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-800 ring-1 ring-amber-200">
          The data bundle tables aren&apos;t on this database yet. Run{" "}
          <code className="font-mono text-xs">nikimart-neon-data-bundles.sql</code> to create them.
        </p>
      ) : orders.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
          No orders match this filter.
        </p>
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Order ID</th>
                  <th className="py-2.5 pr-4 font-semibold">Source</th>
                  <th className="py-2.5 pr-4 font-semibold">Network</th>
                  <th className="py-2.5 pr-4 font-semibold">Size</th>
                  <th className="py-2.5 pr-4 font-semibold">Phone</th>
                  <th className="py-2.5 pr-4 font-semibold">Price</th>
                  <th className="py-2.5 pr-4 font-semibold">Commission</th>
                  <th className="py-2.5 pr-4 font-semibold">Payment</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 pr-4 font-semibold">Date</th>
                  <th className="py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {orders.map((o) => {
                  const label = orderSourceLabel(o);
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-niki-surface/70">
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-niki-ink">
                        {o.reference}
                      </td>
                      <td className="py-3 pr-4 text-xs text-niki-ink/70">
                        <span
                          className={
                            o.source === "WEB" || !o.agentName
                              ? "inline-flex whitespace-nowrap rounded-full bg-niki-black/5 px-2.5 py-1 font-semibold text-niki-ink/70"
                              : "inline-flex whitespace-nowrap rounded-full bg-niki-orange/10 px-2.5 py-1 font-semibold text-niki-orange"
                          }
                          title={label}
                        >
                          {o.source === "WEB" || !o.agentName ? "Nickimart" : o.agentName}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-niki-ink/70">{networkLabel(o.network)}</td>
                      <td className="py-3 pr-4 font-semibold text-niki-ink">
                        {bundleLabel(o.sizeGb)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">
                        {o.recipientPhone}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-niki-ink">
                        {formatMoney(o.price)}
                      </td>
                      <td className="py-3 pr-4">
                        {o.agentCommission > 0 ? (
                          <span
                            className={
                              o.commissionStatus === "earned"
                                ? "font-semibold text-niki-success"
                                : o.commissionStatus === "void"
                                  ? "font-semibold text-niki-ink/30 line-through"
                                  : "font-semibold text-niki-ink/45"
                            }
                          >
                            {formatMoney(o.agentCommission)}
                          </span>
                        ) : (
                          <span className="text-niki-ink/25">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <PaymentPill status={o.paymentStatus} />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-niki-ink/55">
                        {o.createdAt.toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
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
                                providerStatus: o.providerStatus,
                                providerMessage: o.providerMessage,
                              } satisfies OrderView
                            }
                          />

                          {o.paymentStatus === "paid" && !o.providerOrderId ? (
                            <form action={retryDataOrder}>
                              <input type="hidden" name="id" value={o.id} />
                              <button
                                type="submit"
                                title="Send to provider now"
                                className="niki-press inline-flex h-8 w-8 items-center justify-center rounded-full bg-niki-orange text-white hover:bg-niki-orange-light"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}

                          {o.providerOrderId ? (
                            <form action={refreshDataOrderStatus}>
                              <input type="hidden" name="id" value={o.id} />
                              <button type="submit" title="Refresh status" className={iconAction}>
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}

                          {o.status === "failed" ? (
                            <form action={markDataOrderRefunded}>
                              <input type="hidden" name="id" value={o.id} />
                              <button type="submit" title="Mark refunded" className={iconAction}>
                                <Undo2 className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link
              href={href({ status, q: query, page: page - 1 })}
              className="niki-chip rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/75"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-niki-ink/50">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={href({ status, q: query, page: page + 1 })}
              className="niki-chip rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/75"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
