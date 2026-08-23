import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CreditCard, Package, Phone } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { Card, PaymentPill, SourcePill, StatusPill, formatWhen } from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Order — Agent — NikiMart" };
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-niki-ink/55">{label}</dt>
      <dd className="text-right text-sm font-semibold text-niki-ink">{value}</dd>
    </div>
  );
}

export default async function AgentOrderDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const { reference } = await params;

  // Scoped to this agent, so one agent can never read another's order by
  // guessing a reference.
  const order = await prisma.dataOrder
    .findFirst({ where: { reference: decodeURIComponent(reference), agentId: agent.id } })
    .catch(() => null);

  if (!order) notFound();

  const commissionNote =
    order.commissionStatus === "earned"
      ? "Credited to your balance"
      : order.commissionStatus === "void"
        ? "Not earned — this order didn't complete"
        : "Credited once the bundle is delivered";

  return (
    <div className="space-y-5">
      <ActionLink
        href="/agent/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </ActionLink>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold text-niki-ink">{order.reference}</h1>
        <StatusPill status={order.status} />
        <PaymentPill status={order.paymentStatus} />
        <SourcePill source={order.source} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Package details" icon={Package}>
          <dl className="divide-y divide-black/5">
            <Row label="Network" value={networkLabel(order.network)} />
            <Row label="Data size" value={bundleLabel(order.sizeGb)} />
            <Row label="Price charged" value={formatMoney(order.price)} />
            <Row
              label="Your cost"
              value={order.agentCost > 0 ? formatMoney(order.agentCost) : "—"}
            />
            <Row
              label="Your commission"
              value={
                order.agentCommission > 0 ? (
                  <span
                    className={cn(
                      order.commissionStatus === "earned"
                        ? "text-niki-success"
                        : order.commissionStatus === "void"
                          ? "text-niki-ink/35 line-through"
                          : "text-niki-ink/60",
                    )}
                    title={commissionNote}
                  >
                    {formatMoney(order.agentCommission)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </dl>
          <p className="mt-3 text-xs text-niki-ink/50">{commissionNote}.</p>
        </Card>

        <Card title="Customer & delivery" icon={Phone}>
          <dl className="divide-y divide-black/5">
            <Row
              label="Number topped up"
              value={<span className="font-mono">{order.recipientPhone}</span>}
            />
            <Row label="Contact" value={<span className="font-mono">{order.buyerPhone}</span>} />
            {order.buyerEmail ? <Row label="Email" value={order.buyerEmail} /> : null}
            <Row label="Ordered" value={formatWhen(order.createdAt)} />
            {order.paidAt ? <Row label="Paid" value={formatWhen(order.paidAt)} /> : null}
            {order.completedAt ? (
              <Row label="Delivered" value={formatWhen(order.completedAt)} />
            ) : null}
          </dl>
        </Card>

        <Card title="Payment & fulfilment" icon={CreditCard} className="lg:col-span-2">
          <dl className="divide-y divide-black/5">
            <Row label="Payment status" value={<PaymentPill status={order.paymentStatus} />} />
            <Row label="Order status" value={<StatusPill status={order.status} />} />
            {order.providerCode ? (
              <Row label="Provider code" value={<span className="font-mono">{order.providerCode}</span>} />
            ) : null}
            {order.providerMessage ? (
              <Row
                label="Latest update"
                value={<span className="font-normal text-niki-ink/65">{order.providerMessage}</span>}
              />
            ) : null}
          </dl>
          {order.status === "failed" ? (
            <p className="mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm text-niki-danger">
              This order failed after payment. NikiMart support is on it — the customer will be
              credited or refunded, and no commission is charged against you.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
