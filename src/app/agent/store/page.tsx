import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BadgeDollarSign, Link2, Package, Receipt, Store, TrendingUp, Wallet } from "lucide-react";
import { AgentPageHeading, Card, EmptyRow, TableScroll, formatWhen } from "@/components/agent/AgentUi";
import { StoreTabs } from "@/components/agent/StoreTabs";
import { isStoreTab } from "@/lib/data-bundles/store-tabs";
import { StoreLinkForm } from "@/components/agent/StoreLinkForm";
import { StoreOpenToggle } from "@/components/agent/StoreOpenToggle";
import { PricingTable } from "@/components/agent/PricingTable";
import { AfaPricingForm } from "@/components/agent/AfaPricingForm";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { getDataStoreConfig } from "@/lib/settings";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import {
  getAgentBundleRows,
  getAgentForUser,
  getAgentOrders,
  getAgentWallet,
  getAgentWithdrawals,
  type AgentAccount,
} from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Store — Agent — NikiMart" };
export const dynamic = "force-dynamic";

const WITHDRAWAL_TONES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  processed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  rejected: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
};

function Tile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-start gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs">{label}</span>
      </div>
      <p className="mt-2 font-display text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
    </div>
  );
}

export default async function AgentStorePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const params = await searchParams;
  const tab = isStoreTab(params.tab) ? params.tab : "overview";
  const store = await getDataStoreConfig();

  return (
    <div className="space-y-5">
      <AgentPageHeading
        title="Store"
        subtitle="Manage your online store and what your customers see."
      />

      <StoreOpenToggle open={agent.storeOpen} />

      {/* Suspense because StoreTabs reads the query string. */}
      <Suspense fallback={<div className="h-12" />}>
        <StoreTabs afaEnabled={store.afaEnabled} />
      </Suspense>

      {tab === "overview" ? <OverviewPanel agent={agent} /> : null}

      {tab === "link" ? (
        <Card title="Store link" description="Your public address and support contacts." icon={Link2}>
          <StoreLinkForm
            origin={siteUrl()}
            initial={{
              storeName: agent.storeName,
              slug: agent.slug,
              storeTagline: agent.storeTagline,
              storeAbout: agent.storeAbout,
              supportPhone: agent.supportPhone,
              supportWhatsapp: agent.supportWhatsapp,
              whatsappGroup: agent.whatsappGroup,
            }}
          />
        </Card>
      ) : null}

      {tab === "pricing" ? (
        <Card title="Package pricing" description="What you charge for each bundle." icon={Package}>
          <PricingTable rows={await getAgentBundleRows(agent.id)} />
        </Card>
      ) : null}

      {tab === "afa" && store.afaEnabled ? (
        <Card title="AFA pricing" description="Your AFA registration price." icon={BadgeDollarSign}>
          <AfaPricingForm
            basePrice={store.afaPrice}
            initialPrice={agent.afaPrice}
            initialAvailable={agent.afaEnabled}
          />
        </Card>
      ) : null}

      {tab === "withdrawals" ? <WithdrawalsPanel agentId={agent.id} /> : null}
    </div>
  );
}

async function OverviewPanel({ agent }: { agent: AgentAccount }) {
  const [wallet, recent] = await Promise.all([
    getAgentWallet(agent),
    getAgentOrders(agent.id, { take: 10 }),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Total sales" value={formatMoney(wallet.totalSales)} icon={TrendingUp} />
        <Tile label="Commission earned" value={formatMoney(wallet.commissionEarned)} icon={Store} />
        <Tile label="Withdrawn" value={formatMoney(wallet.totalWithdrawn)} icon={Wallet} />
      </div>

      <Card title="Recent store orders" description="The last ten sales through your store.">
        {recent.rows.length === 0 ? (
          <EmptyRow>No sales yet. Share your store link to get started.</EmptyRow>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Phone</th>
                  <th className="py-2.5 pr-4 font-semibold">Package</th>
                  <th className="py-2.5 pr-4 font-semibold">Price</th>
                  <th className="py-2.5 pr-4 font-semibold">Commission</th>
                  <th className="py-2.5 pr-4 font-semibold">Payment</th>
                  <th className="py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {recent.rows.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-niki-surface/70">
                    <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">
                      {o.recipientPhone}
                    </td>
                    <td className="py-3 pr-4 text-niki-ink/70">
                      {networkLabel(o.network)} · {bundleLabel(o.sizeGb)}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-niki-ink">{formatMoney(o.price)}</td>
                    <td
                      className={cn(
                        "py-3 pr-4 font-semibold",
                        o.commissionStatus === "earned" ? "text-niki-success" : "text-niki-ink/40",
                      )}
                    >
                      {o.agentCommission > 0 ? formatMoney(o.agentCommission) : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          o.paymentStatus === "paid"
                            ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                            : "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
                        )}
                      >
                        {o.paymentStatus === "paid" ? "Payment success" : "Payment failed"}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap text-xs text-niki-ink/55">
                      {formatWhen(o.createdAt)}
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

async function WithdrawalsPanel({ agentId }: { agentId: string }) {
  const rows = await getAgentWithdrawals(agentId);

  return (
    <Card
      title="Withdrawal history"
      description="Commission withdrawals and where each one got to."
      icon={Receipt}
    >
      {rows.length === 0 ? (
        <EmptyRow>No withdrawals yet.</EmptyRow>
      ) : (
        <TableScroll>
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                <th className="py-2.5 pr-4 font-semibold">Date</th>
                <th className="py-2.5 pr-4 font-semibold">Amount</th>
                <th className="py-2.5 pr-4 font-semibold">Fee</th>
                <th className="py-2.5 pr-4 font-semibold">MoMo number</th>
                <th className="py-2.5 pr-4 font-semibold">Name on account</th>
                <th className="py-2.5 pr-4 font-semibold">Network</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {rows.map((w) => (
                <tr key={w.id} className="transition-colors hover:bg-niki-surface/70">
                  <td className="py-3 pr-4 whitespace-nowrap text-xs text-niki-ink/55">
                    {formatWhen(w.createdAt)}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-niki-ink">{formatMoney(w.amount)}</td>
                  <td className="py-3 pr-4 text-niki-ink/55">
                    {w.fee > 0 ? formatMoney(w.fee) : "—"}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-niki-ink/70">{w.momoPhone}</td>
                  <td className="py-3 pr-4 text-niki-ink/70">{w.momoName}</td>
                  <td className="py-3 pr-4 text-niki-ink/70">{w.momoNetwork}</td>
                  <td className="py-3">
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
                        WITHDRAWAL_TONES[w.status] ?? WITHDRAWAL_TONES.pending,
                      )}
                      title={w.adminNote || undefined}
                    >
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}
