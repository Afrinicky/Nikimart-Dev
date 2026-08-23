import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import {
  AgentPageHeading,
  Card,
  EmptyRow,
  Pager,
  SourcePill,
  StatusPill,
  TableScroll,
  formatWhen,
} from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel, DATA_ORDER_STATUSES } from "@/lib/data-bundles/networks";
import { getAgentForUser, getAgentOrders } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Orders — Agent — NikiMart" };
export const dynamic = "force-dynamic";

const PER_PAGE = 10;

const FILTERS = [
  { value: "all", label: "All" },
  ...DATA_ORDER_STATUSES.map((s) => ({
    value: s,
    label: s === "completed" ? "Delivered" : s[0].toUpperCase() + s.slice(1),
  })),
];

export default async function AgentOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const params = await searchParams;
  const status = FILTERS.some((f) => f.value === params.status) ? params.status! : "all";
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total } = await getAgentOrders(agent.id, {
    take: PER_PAGE,
    skip: (page - 1) * PER_PAGE,
    status,
  });
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  const hrefFor = (p: number) =>
    `/agent/orders?${new URLSearchParams({ status, page: String(p) }).toString()}`;

  return (
    <div className="space-y-5">
      <AgentPageHeading title="Orders" subtitle="Every bundle sold through your store or dashboard.">
        <ActionLink
          href={hrefFor(page)}
          className="flex items-center gap-1.5 rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </ActionLink>
      </AgentPageHeading>

      {/* Status filter */}
      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <ActionLink
            key={f.value}
            href={`/agent/orders?status=${f.value}`}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-semibold",
              f.value === status
                ? "bg-niki-orange text-white"
                : "bg-white text-niki-ink/65 ring-1 ring-black/5 hover:bg-niki-navy/5",
            )}
          >
            {f.label}
          </ActionLink>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyRow>
            {status === "all"
              ? "No orders yet. Share your store link and your first sale will land here."
              : "No orders with that status."}
          </EmptyRow>
        ) : (
          <>
            <TableScroll>
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-[11px] uppercase tracking-wide text-niki-ink/45">
                    <th className="py-2.5 pr-4 font-semibold">Reference</th>
                    <th className="py-2.5 pr-4 font-semibold">Network</th>
                    <th className="py-2.5 pr-4 font-semibold">Size</th>
                    <th className="py-2.5 pr-4 font-semibold">Phone</th>
                    <th className="py-2.5 pr-4 font-semibold">Price</th>
                    <th className="py-2.5 pr-4 font-semibold">Commission</th>
                    <th className="py-2.5 pr-4 font-semibold">Status</th>
                    <th className="py-2.5 pr-4 font-semibold">Source</th>
                    <th className="py-2.5 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {rows.map((o) => (
                    <tr key={o.id} className="transition-colors hover:bg-niki-surface/70">
                      <td className="py-3 pr-4">
                        <ActionLink
                          href={`/agent/orders/${encodeURIComponent(o.reference)}`}
                          className="font-mono text-xs font-semibold text-niki-trust hover:underline"
                        >
                          {o.reference}
                        </ActionLink>
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
                            className={cn(
                              "font-semibold",
                              o.commissionStatus === "earned"
                                ? "text-niki-success"
                                : o.commissionStatus === "void"
                                  ? "text-niki-ink/30 line-through"
                                  : "text-niki-ink/45",
                            )}
                            title={
                              o.commissionStatus === "earned"
                                ? "Credited to your balance"
                                : o.commissionStatus === "void"
                                  ? "Not earned — the order didn't complete"
                                  : "Credited once the bundle is delivered"
                            }
                          >
                            {formatMoney(o.agentCommission)}
                          </span>
                        ) : (
                          <span className="text-niki-ink/25">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="py-3 pr-4">
                        <SourcePill source={o.source} />
                      </td>
                      <td className="py-3 whitespace-nowrap text-xs text-niki-ink/55">
                        {formatWhen(o.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>

            <Pager page={page} pageCount={pageCount} total={total} hrefFor={hrefFor} />
          </>
        )}
      </Card>
    </div>
  );
}
