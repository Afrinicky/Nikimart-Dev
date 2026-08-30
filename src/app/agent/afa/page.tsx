import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, EmptyRow, TableScroll, StatusPill, formatWhen } from "@/components/agent/AgentUi";
import { AfaForm } from "@/components/data/AfaForm";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { getDataStoreConfig } from "@/lib/settings";
import { getAgentForUser } from "@/lib/data-bundles/agents";

export const metadata: Metadata = { title: "AFA — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * AFA Services: register a customer, and see every registration you've sold.
 *
 * Registrations raised here go through the agent's own storefront pricing, so
 * they earn on them exactly as on a bundle.
 */
export default async function AgentAfaPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const store = await getDataStoreConfig();
  if (!store.afaEnabled) notFound();

  const price = agent.afaPrice > 0 ? agent.afaPrice : store.afaPrice;
  const commission = Math.max(0, Math.round((price - store.afaPrice) * 100) / 100);

  const rows = await prisma.afaRegistration
    .findMany({ where: { agentId: agent.id }, orderBy: { createdAt: "desc" }, take: 25 })
    .catch(() => []);

  return (
    <div className="space-y-5">
      <AgentPageHeading
        title="AFA Services"
        subtitle="Register customers for AFA and earn on every one."
      >
        <ActionLink
          href="/agent/store?tab=afa"
          className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
        >
          Edit AFA price
        </ActionLink>
      </AgentPageHeading>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            Your AFA price
          </p>
          <p className="mt-1 font-figures text-2xl font-bold text-niki-ink">{formatMoney(price)}</p>
          <p className="mt-0.5 text-xs text-niki-ink/50">
            Nickimart charges {formatMoney(store.afaPrice)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            You earn per registration
          </p>
          <p className="mt-1 font-figures text-2xl font-bold text-niki-success">
            {formatMoney(commission)}
          </p>
          <p className="mt-0.5 text-xs text-niki-ink/50">Credited once the registration is approved</p>
        </div>
      </div>

      <Card
        title="Register a customer"
        description="The details go straight to the provider once payment clears."
        icon={BadgeCheck}
      >
        <AfaForm price={price} storeSlug={agent.slug} trackHref="/agent/orders" />
      </Card>

      <Card title="My AFA registrations" description={`${rows.length} shown`}>
        {rows.length === 0 ? (
          <EmptyRow>No registrations yet.</EmptyRow>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Customer</th>
                  <th className="py-2.5 pr-4 font-semibold">Phone</th>
                  <th className="py-2.5 pr-4 font-semibold">Town</th>
                  <th className="py-2.5 pr-4 font-semibold">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-niki-surface/70">
                    <td className="py-3 pr-4 font-semibold text-niki-ink">{r.fullName}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">{r.phoneNumber}</td>
                    <td className="py-3 pr-4 text-niki-ink/70">{r.town}</td>
                    <td className="py-3 pr-4 font-semibold text-niki-ink">{formatMoney(r.price)}</td>
                    <td className="py-3 pr-4">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="py-3 whitespace-nowrap text-xs text-niki-ink/55">
                      {formatWhen(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}
