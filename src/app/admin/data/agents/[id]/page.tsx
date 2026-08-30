import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Package, Receipt, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { BalanceAdjuster } from "@/components/admin/AgentAdminTools";
import { AgentAccountTools, SetupLinkTool } from "@/components/admin/AgentAccountTools";
import { siteUrl } from "@/lib/site";
import { formatWhen } from "@/components/agent/AgentUi";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import {
  getAgentLedger,
  getAgentOrders,
  getAgentWallet,
  getAgentWithdrawals,
} from "@/lib/data-bundles/agents";
import { setAgentStatus } from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agent — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "success" | "danger" }) {
  const tones = { ink: "text-niki-ink", success: "text-niki-success", danger: "text-niki-danger" };
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45 sm:text-xs">{label}</p>
      <p className={`mt-2 font-figures text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export default async function AdminAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const agent = await prisma.dataAgent
    .findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true, phone: true, passwordHash: true } } },
    })
    .catch(() => null);

  if (!agent) notFound();

  const [wallet, ledger, orders, withdrawals] = await Promise.all([
    getAgentWallet(agent),
    getAgentLedger(agent.id, 25),
    getAgentOrders(agent.id, { take: 10 }),
    getAgentWithdrawals(agent.id, 10),
  ]);

  const suspended = agent.status !== "active";

  return (
    <Container className="py-8">
      <ActionLink
        href="/admin/data/agents"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </ActionLink>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">{agent.storeName}</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {agent.user?.name ?? "—"} · {agent.user?.email ?? "—"} ·{" "}
            <span className="font-mono">{agent.supportPhone || agent.user?.phone || "—"}</span>
          </p>
          <p className="mt-1 text-xs text-niki-ink/45">
            Agent code <span className="font-mono">{agent.code}</span> · joined{" "}
            {formatWhen(agent.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`/store/${agent.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="niki-press niki-chip flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-niki-ink/75"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View store
          </a>
          <form action={setAgentStatus}>
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
            <button
              type="submit"
              className={cn(
                "niki-press rounded-full px-4 py-2 text-xs font-semibold text-white",
                suspended ? "bg-niki-success" : "bg-niki-danger",
              )}
            >
              {suspended ? "Reactivate agent" : "Suspend agent"}
            </button>
          </form>
        </div>
      </div>

      {suspended ? (
        <p className="mt-4 rounded-2xl bg-niki-danger/10 px-5 py-4 text-sm text-niki-danger ring-1 ring-niki-danger/30">
          This agent is suspended. Their storefront is closed and delivered orders aren&apos;t
          crediting commission — reactivating releases anything that accrued while they were off.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          label="Balance"
          value={formatMoney(wallet.balance)}
          tone={wallet.balance < 0 ? "danger" : "success"}
        />
        <Tile label="Commission earned" value={formatMoney(wallet.commissionEarned)} />
        <Tile label="Sales" value={formatMoney(wallet.totalSales)} />
        <Tile label="Withdrawn" value={formatMoney(wallet.totalWithdrawn)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-niki-orange" />
              <h2 className="font-display font-bold text-niki-ink">Recent orders</h2>
            </div>
            {orders.rows.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                No orders yet.
              </p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                      <th className="py-2.5 pr-4 font-semibold">Reference</th>
                      <th className="py-2.5 pr-4 font-semibold">Package</th>
                      <th className="py-2.5 pr-4 font-semibold">Price</th>
                      <th className="py-2.5 pr-4 font-semibold">Commission</th>
                      <th className="py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-niki-edge">
                    {orders.rows.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">
                          {o.reference}
                        </td>
                        <td className="py-3 pr-4 text-niki-ink/70">
                          {networkLabel(o.network)} · {bundleLabel(o.sizeGb)}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-niki-ink">
                          {formatMoney(o.price)}
                        </td>
                        <td className="py-3 pr-4 text-niki-ink/70">
                          {o.agentCommission > 0 ? formatMoney(o.agentCommission) : "—"}
                        </td>
                        <td className="py-3 text-xs uppercase text-niki-ink/55">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-niki-orange" />
              <h2 className="font-display font-bold text-niki-ink">Ledger</h2>
            </div>
            {ledger.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                Nothing posted yet.
              </p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {ledger.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-niki-ink">{e.type}</p>
                      <p className="truncate text-xs text-niki-ink/55">{e.narration}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          e.amount < 0 ? "text-niki-danger" : "text-niki-success",
                        )}
                      >
                        {e.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(e.amount))}
                      </p>
                      <p className="text-[11px] text-niki-ink/40">{formatWhen(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <BalanceAdjuster agentId={agent.id} />

          {/* An agent whose account has no password has never been able to sign
              in — the setup link either was never delivered or has expired. */}
          {agent.user && !agent.user.passwordHash ? (
            <SetupLinkTool agentId={agent.id} name={agent.user.name ?? agent.storeName} />
          ) : null}

          <AgentAccountTools
            agentId={agent.id}
            origin={siteUrl()}
            initial={{
              storeName: agent.storeName,
              slug: agent.slug,
              storeTagline: agent.storeTagline ?? "",
              storeAbout: agent.storeAbout ?? "",
              supportPhone: agent.supportPhone ?? "",
              supportWhatsapp: agent.supportWhatsapp ?? "",
              whatsappGroup: agent.whatsappGroup ?? "",
              storeOpen: agent.storeOpen,
              status: agent.status,
              afaEnabled: agent.afaEnabled,
              afaPrice: agent.afaPrice,
              ownerName: agent.user?.name ?? "",
              ownerPhone: agent.user?.phone ?? "",
              userId: agent.userId,
            }}
          />

          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-niki-orange" />
              <h2 className="font-display font-bold text-niki-ink">Withdrawals</h2>
            </div>
            {withdrawals.length === 0 ? (
              <p className="text-sm text-niki-ink/55">None yet.</p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {withdrawals.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-niki-ink">{formatMoney(w.amount)}</p>
                      <p className="font-mono text-[11px] text-niki-ink/45">{w.momoPhone}</p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase text-niki-ink/55">
                      {w.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Container>
  );
}
