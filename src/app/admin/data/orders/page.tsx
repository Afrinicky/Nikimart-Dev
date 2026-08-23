import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { FilterChip } from "@/components/admin/FilterChip";
import { formatPrice } from "@/lib/format";
import {
  DATA_ORDER_STATUSES,
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { ORDERS_PER_PAGE, getDataOrders } from "@/lib/data-bundles/reporting";
import {
  markDataOrderRefunded,
  refreshDataOrderStatus,
  retryDataOrder,
} from "@/lib/data-bundles/admin-actions";

export const metadata: Metadata = { title: "Bundle Orders — Admin — NikiMart" };
export const dynamic = "force-dynamic";

function href(params: { status?: string; q?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/data/orders?${qs}` : "/admin/data/orders";
}

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

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Bundle orders</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {available ? `${total} ${total === 1 ? "order" : "orders"}` : "Tables not migrated yet"}
          </p>
        </div>
        <form action="/admin/data/orders" className="flex gap-2">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <input
            name="q"
            defaultValue={query}
            placeholder="Reference or phone"
            className="rounded-xl border border-niki-edge-strong bg-white px-4 py-2 text-sm outline-none focus:border-niki-orange"
          />
          <button type="submit" className="rounded-xl bg-niki-navy px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
        </form>
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
        <div className="mt-6 space-y-3">
          {orders.map((o) => {
            const known = isDataOrderStatus(o.status) ? o.status : "processing";
            const margin = o.costPrice > 0 ? o.price - o.costPrice : null;
            return (
              <div key={o.id} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-niki-ink">
                      {bundleLabel(o.sizeGb)} {networkLabel(o.network)}
                      <span className="ml-2 font-sans text-sm font-normal text-niki-ink/50">
                        → {o.recipientPhone}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-niki-ink/50">
                      {o.buyerName ? `${o.buyerName} · ` : ""}
                      {o.buyerPhone} · {o.createdAt.toLocaleString("en-GH")}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-niki-ink/40">
                      {o.reference}
                      {o.providerCode ? ` · ${o.providerCode}` : ""}
                      {o.providerStatus ? ` · provider: ${o.providerStatus}` : ""}
                    </p>
                    {o.providerMessage && known === "failed" ? (
                      <p className="mt-1 text-xs text-niki-danger">{o.providerMessage}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DATA_STATUS_TONES[known]}`}>
                      {DATA_STATUS_LABELS[known]}
                    </span>
                    <span className="font-display font-bold text-niki-ink">{formatPrice(o.price)}</span>
                    {margin !== null ? (
                      <span className="text-[11px] text-niki-ink/40">
                        cost {formatPrice(o.costPrice)} · margin {formatPrice(Math.round(margin * 100) / 100)}
                      </span>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {o.paymentStatus === "paid" && !o.providerOrderId ? (
                        <form action={retryDataOrder}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1.5 rounded-lg bg-niki-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-orange-light"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Send now
                          </button>
                        </form>
                      ) : null}

                      {o.providerOrderId ? (
                        <form action={refreshDataOrderStatus}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-navy/5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh
                          </button>
                        </form>
                      ) : null}

                      {known === "failed" ? (
                        <form action={markDataOrderRefunded}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-navy/5"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Mark refunded
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link href={href({ status, q: query, page: page - 1 })} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-niki-edge">
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-niki-ink/50">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ status, q: query, page: page + 1 })} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-niki-edge">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
