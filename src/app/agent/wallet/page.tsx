import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Banknote, TrendingUp, Wallet } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, EmptyRow, TableScroll, formatWhen } from "@/components/agent/AgentUi";
import { WithdrawPanel } from "@/components/agent/WithdrawPanel";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/settings";
import {
  getAgentForUser,
  getAgentLedger,
  getAgentWallet,
  withdrawableFrom,
} from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Wallet — Agent — NikiMart" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  SETUP_FEE: "Setup fee",
  COMMISSION: "Commission earned",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal reversed",
  ADJUSTMENT: "Adjustment",
};

const TYPE_TONES: Record<string, string> = {
  SETUP_FEE: "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
  COMMISSION: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  WITHDRAWAL: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  WITHDRAWAL_REVERSAL: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
  ADJUSTMENT: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
};

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone: "ink" | "success" | "danger" | "orange" | "trust";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
    trust: "text-niki-trust",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-start gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs">{label}</span>
      </div>
      <p className={`mt-2 font-display text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-niki-ink/50 sm:text-xs">{hint}</p> : null}
    </div>
  );
}

export default async function AgentWalletPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [wallet, ledger, program] = await Promise.all([
    getAgentWallet(agent),
    getAgentLedger(agent.id, 60),
    getAgentProgramConfig(),
  ]);

  const available = withdrawableFrom(wallet);

  return (
    <div className="space-y-5">
      <AgentPageHeading
        title="Wallet"
        subtitle="Your balance, every commission that built it, and your payouts."
      >
        <ActionLink
          href="/agent/store?tab=withdrawals"
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-navy/5"
        >
          Withdrawal history
        </ActionLink>
      </AgentPageHeading>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          label="Balance"
          value={formatMoney(wallet.balance)}
          hint={wallet.balance < 0 ? "Clearing from commissions" : "On your account"}
          icon={Wallet}
          tone={wallet.balance < 0 ? "danger" : "success"}
        />
        <Tile
          label="Available"
          value={formatMoney(available)}
          hint={
            wallet.pendingWithdrawals > 0
              ? `${formatMoney(wallet.pendingWithdrawals)} held for a pending payout`
              : "Ready to withdraw"
          }
          icon={Banknote}
          tone="orange"
        />
        <Tile
          label="Commission earned"
          value={formatMoney(wallet.commissionEarned)}
          hint={
            wallet.commissionPending > 0
              ? `${formatMoney(wallet.commissionPending)} awaiting delivery`
              : "Credited on delivery"
          }
          icon={TrendingUp}
          tone="success"
        />
        <Tile
          label="Sales"
          value={formatMoney(wallet.totalSales)}
          hint={`${wallet.orderCount} paid ${wallet.orderCount === 1 ? "order" : "orders"}`}
          icon={ArrowUpRight}
          tone="ink"
        />
      </div>

      {wallet.outstandingSetup > 0 ? (
        <p className="animate-fade-up rounded-2xl bg-niki-gold/10 px-5 py-4 text-sm text-niki-ink/70 ring-1 ring-niki-gold/40">
          <span className="font-semibold text-niki-ink">
            {formatMoney(wallet.outstandingSetup)} of your {formatMoney(agent.setupFee)} setup fee is
            still outstanding.
          </span>{" "}
          It clears itself as commission comes in — there is nothing to pay separately, and you can
          withdraw as soon as the balance passes zero.
        </p>
      ) : null}

      <WithdrawPanel
        available={available}
        minWithdrawal={program.minWithdrawal}
        withdrawalFee={program.withdrawalFee}
        defaultPhone={agent.supportPhone}
        defaultName={user.name ?? ""}
      />

      <Card title="Transactions" description="Every movement on your balance, newest first.">
        {ledger.length === 0 ? (
          <EmptyRow>Nothing yet. Your first commission will show up here.</EmptyRow>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Type</th>
                  <th className="py-2.5 pr-4 font-semibold">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Balance after</th>
                  <th className="py-2.5 pr-4 font-semibold">Narration</th>
                  <th className="py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {ledger.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-niki-surface/70">
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          TYPE_TONES[e.type] ?? TYPE_TONES.ADJUSTMENT,
                        )}
                      >
                        {TYPE_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "py-3 pr-4 whitespace-nowrap font-semibold",
                        e.amount < 0 ? "text-niki-danger" : "text-niki-success",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {e.amount < 0 ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        )}
                        {e.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(e.amount))}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-semibold text-niki-ink">
                      {formatMoney(e.balanceAfter)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-niki-ink/65">{e.narration}</td>
                    <td className="py-3 whitespace-nowrap text-xs text-niki-ink/55">
                      {formatWhen(e.createdAt)}
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
