import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Download } from "lucide-react";
import {
  AgentPageHeading,
  Card,
  EmptyRow,
  NetworkCell,
  SourcePill,
  StatusPill,
  TableScroll,
  formatWhen,
} from "@/components/agent/AgentUi";
import { OrderActions, type OrderView } from "@/components/data/OrderActions";
import { OrderFilters } from "@/components/data/OrderFilters";
import { OrderPager } from "@/components/data/OrderPager";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { bundleLabel } from "@/lib/data-bundles/networks";
import {
  ORDER_NETWORK_OPTIONS,
  ORDER_STATUS_OPTIONS,
  orderStatusFilter,
  perPageFrom,
} from "@/lib/data-bundles/order-filters";
import { getAgentForUser, getAgentOrders } from "@/lib/data-bundles/agents";
import { getDataStoreConfig } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Orders — Agent — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export default async function AgentOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    network?: string;
    q?: string;
    per?: string;
  }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const params = await searchParams;
  const status = orderStatusFilter(params.status).value;
  const network = ORDER_NETWORK_OPTIONS.some((n) => n.value === params.network)
    ? params.network!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per);
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, store] = await Promise.all([
    getAgentOrders(agent.id, {
      take: perPage,
      skip: (page - 1) * perPage,
      status,
      network,
      query,
    }),
    getDataStoreConfig(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const sourceLabel = (source: string) =>
    source === "STOREFRONT" ? "Storefront" : source === "AGENT" ? "Dashboard" : "Web";

  const exportHref = `/agent/orders/export?${new URLSearchParams({ status, network, q: query }).toString()}`;
  // The agent's own support line is who a "not received" report goes to; when
  // they haven't set one, Nickimart's own support takes it.
  const whatsapp = agent.supportWhatsapp || store.whatsapp || undefined;

  return (
    <div className="space-y-4">
      <AgentPageHeading title="Orders" subtitle="View and manage your data bundle orders.">
        <a
          href={exportHref}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </a>
      </AgentPageHeading>

      {/* Suspense because the filter bar reads the query string. */}
      <Suspense fallback={<div className="h-40" />}>
        <OrderFilters
          status={status}
          network={network}
          query={query}
          statusOptions={ORDER_STATUS_OPTIONS}
          networkOptions={ORDER_NETWORK_OPTIONS}
          shown={rows.length}
          total={total}
          page={page}
          pageCount={pageCount}
        />
      </Suspense>

      <Card className="p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyRow>
              {status === "all" && !query && network === "all"
                ? "No orders yet. Share your store link and your first sale will land here."
                : "No orders match these filters."}
            </EmptyRow>
          </div>
        ) : (
          <div className="p-5">
            <TableScroll>
              <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>Order ID</th>
                    <th className={th}>Network</th>
                    <th className={th}>Size</th>
                    <th className={th}>Phone Number</th>
                    <th className={th}>Price</th>
                    <th className={th}>Status</th>
                    <th className={th}>Source</th>
                    <th className={th}>Date</th>
                    <th className={`${th} rounded-r-xl`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                    >
                      <td className={`${td} font-mono text-xs font-semibold text-niki-ink`}>
                        {o.reference}
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
                      <td className={td}>
                        <SourcePill source={o.source} />
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                        {formatWhen(o.createdAt)}
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
                              sourceLabel: sourceLabel(o.source),
                              commission: o.agentCommission,
                              commissionStatus: o.commissionStatus,
                              createdAt: o.createdAt.toISOString(),
                              updatedAt: o.updatedAt?.toISOString() ?? null,
                            } satisfies OrderView
                          }
                          whatsapp={whatsapp}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>

            <Suspense fallback={<div className="h-12" />}>
              <OrderPager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </div>
        )}
      </Card>
    </div>
  );
}
