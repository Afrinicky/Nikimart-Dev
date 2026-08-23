import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Link2,
  ListOrdered,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentTopup, type TopupBundle } from "@/components/agent/AgentTopup";
import { CopyChip } from "@/components/agent/AgentCode";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import {
  getAgentBundleRows,
  getAgentForUser,
  getAgentWallet,
} from "@/lib/data-bundles/agents";

export const metadata: Metadata = { title: "Agent Dashboard — NikiMart" };
export const dynamic = "force-dynamic";

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "ink",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "danger" | "orange";
  href?: string;
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;

  const body = (
    <>
      <div className="flex items-start gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs">{label}</span>
        {href ? (
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      <p className={`mt-2 font-display text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-niki-ink/50 sm:text-xs">{hint}</p> : null}
    </>
  );

  if (!href) return <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">{body}</div>;
  return (
    <ActionLink
      href={href}
      className="group niki-lift block rounded-2xl bg-white p-5 ring-1 ring-black/5 hover:shadow-lg"
    >
      {body}
    </ActionLink>
  );
}

export default async function AgentDashboardPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [wallet, rows] = await Promise.all([
    getAgentWallet(agent),
    getAgentBundleRows(agent.id),
  ]);

  const bundles: TopupBundle[] = rows.map((r) => ({
    network: r.network,
    sizeGb: r.sizeGb,
    agentPrice: r.agentPrice,
    storePrice: r.price,
    validity: r.validity,
  }));

  const storeLink = `${siteUrl()}/store/${agent.slug}`;

  return (
    <div className="space-y-6">
      {/* Balance and the numbers behind it. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          label="Balance"
          value={formatMoney(wallet.balance)}
          hint={
            wallet.balance < 0
              ? `${formatMoney(-wallet.balance)} still to clear from commissions`
              : "Available to withdraw"
          }
          icon={Wallet}
          tone={wallet.balance < 0 ? "danger" : "success"}
          href="/agent/wallet"
        />
        <Tile
          label="Commission earned"
          value={formatMoney(wallet.commissionEarned)}
          hint={
            wallet.commissionPending > 0
              ? `${formatMoney(wallet.commissionPending)} pending delivery`
              : "Credited on delivery"
          }
          icon={TrendingUp}
          tone="orange"
          href="/agent/wallet"
        />
        <Tile
          label="Store sales"
          value={formatMoney(wallet.totalSales)}
          hint={`${wallet.orderCount} paid ${wallet.orderCount === 1 ? "order" : "orders"}`}
          icon={ListOrdered}
          href="/agent/orders"
        />
        <Tile
          label="Withdrawn"
          value={formatMoney(wallet.totalWithdrawn)}
          hint={
            wallet.pendingWithdrawals > 0
              ? `${formatMoney(wallet.pendingWithdrawals)} awaiting payout`
              : "Paid to your MoMo"
          }
          icon={Wallet}
          href="/agent/wallet"
        />
      </div>

      {/* While the setup fee is outstanding, say plainly what is happening —
          a negative balance with no explanation reads as a bug. */}
      {wallet.outstandingSetup > 0 ? (
        <div className="animate-fade-up flex flex-col gap-3 rounded-2xl bg-niki-gold/10 p-5 ring-1 ring-niki-gold/40 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-gold/20 text-niki-gold">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold text-niki-ink">
              {formatMoney(wallet.outstandingSetup)} of your setup fee is still clearing
            </p>
            <p className="mt-1 text-sm text-niki-ink/65">
              Nothing to pay up front — your storefront cost {formatMoney(agent.setupFee)} and it
              comes out of the commission you earn. Once the balance passes zero, everything above it
              is yours to withdraw.
            </p>
          </div>
        </div>
      ) : null}

      {/* Share the store. The link is long, so it truncates and the copy
          button carries the full value — never let it push the card wider than
          the phone. */}
      <div className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-white p-5 ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display font-bold text-niki-ink">
            <Link2 className="h-4 w-4 shrink-0 text-niki-orange" />
            Your store link
          </p>
          <p className="mt-1 truncate font-mono text-sm text-niki-ink/60">{storeLink}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <CopyChip
            value={storeLink}
            label="Copy link"
            hideValue
            className="bg-niki-surface text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5"
          />
          <ActionLink
            href="/agent/store?tab=link"
            className="flex items-center gap-1.5 rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white"
          >
            Edit store
          </ActionLink>
        </div>
      </div>

      {/* Data Topup */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-niki-ink">Data Topup</h1>
            <p className="mt-1 text-sm text-niki-ink/60">
              Select a network and bundle to send data for a customer at your agent price.
            </p>
          </div>
          <ActionLink
            href="/agent/orders"
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Check delivery status
          </ActionLink>
        </div>

        <div className="mt-4">
          <AgentTopup bundles={bundles} />
        </div>
      </section>
    </div>
  );
}
