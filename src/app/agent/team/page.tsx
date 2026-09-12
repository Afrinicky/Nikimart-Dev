import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Coins, HandCoins, Share2, Users } from "lucide-react";
import { AgentPageHeading, Card, EmptyRow, TableScroll, formatWhen } from "@/components/agent/AgentUi";
import { ReferralShare } from "@/components/agent/ReferralShare";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { getTeamSummary, type TeamMember } from "@/lib/data-bundles/referrals";
import { referralLink, referralRewardsLine } from "@/lib/data-bundles/referral-rules";
import { registrationFeeStatus } from "@/lib/data-bundles/registration-fee";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "My Team — Agent — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45">
        {label}
      </p>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

function RecruitTable({ members, level }: { members: TeamMember[]; level: 1 | 2 }) {
  if (members.length === 0) {
    return (
      <TableScroll>
        <table className="w-full text-sm">
          <tbody>
            <EmptyRow>
              {level === 1
                ? "Nobody has joined with your code yet. Share it and they'll appear here."
                : "Nobody your recruits brought on board yet."}
            </EmptyRow>
          </tbody>
        </table>
      </TableScroll>
    );
  }

  return (
    <TableScroll>
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
          <tr>
            <th className="py-2.5 pr-3 font-semibold">Agent</th>
            <th className="px-3 py-2.5 font-semibold">Joined</th>
            <th className="px-3 py-2.5 font-semibold">Registration</th>
            <th className="px-3 py-2.5 text-right font-semibold">Sales</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-niki-edge/60 last:border-0">
              <td className="py-2.5 pr-3">
                <span className="font-semibold text-niki-ink">{m.storeName}</span>
                <span className="ml-2 font-mono text-xs text-niki-ink/45">{m.code}</span>
                {m.status !== "active" ? (
                  <span className="ml-2 text-xs text-niki-danger">suspended</span>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-niki-ink/60">{formatWhen(m.joinedAt)}</td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    m.registrationPaid ? "text-niki-success" : "text-amber-600",
                  )}
                >
                  {m.registrationPaid ? "Paid" : "Not paid yet"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className="font-figures font-semibold text-niki-ink">
                  {formatMoney(m.sales)}
                </span>
                <span className="ml-1.5 text-xs text-niki-ink/45">
                  {m.orderCount} {m.orderCount === 1 ? "order" : "orders"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * My Team: who this agent has brought on board, and what it has earned them.
 *
 * Two levels and no more, because that is the programme — direct recruits, and
 * the people those recruits bring in. Sales earnings come from the first level
 * only, which is why team sales counts only direct recruits; showing the second
 * level's sales in that total would promise money that is never paid.
 *
 * Everything here is read from the agent's own ledger, not a second set of
 * books. The numbers on this screen and the balance on the wallet are the same
 * money, and reconcile line for line.
 */
export default async function AgentTeamPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [team, config] = await Promise.all([getTeamSummary(agent), getReferralConfig()]);
  // The prompt to pay an outstanding registration fee is in the agent shell, on
  // every screen — this page only needs to know whether their own upline is
  // still waiting on it.
  const fee = registrationFeeStatus(agent);
  const link = referralLink(siteUrl(), agent.code);

  return (
    <div className="space-y-6">
      <AgentPageHeading title="My team" subtitle="Recruit agents and earn from what they sell." />

      {fee.payable ? (
        <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Your own registration fee of {formatMoney(fee.outstanding)} is outstanding. Referral
          rewards only pay once it is settled.
        </p>
      ) : null}

      {!config.enabled ? (
        <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          The referral programme is paused. Nothing you have already earned is affected.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ReferralShare code={team.code} link={link} />
        <Card title="How it pays" icon={HandCoins}>
          <ul className="space-y-3 text-sm text-niki-ink/70">
            {[
              referralRewardsLine(config),
              "Joining rewards pay once your recruit's registration fee is settled.",
              "You also earn on every qualifying bundle your direct recruits sell.",
              "Everything lands in your normal balance.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-niki-orange" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {config.pitch ? (
            <p className="mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70">
              {config.pitch}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Direct recruits" value={String(team.level1.length)} hint="Level 1" />
        <Tile label="Second level" value={String(team.level2.length)} hint="Their recruits" />
        <Tile
          label="Active recruits"
          value={String(team.activeRecruits)}
          hint="Trading, not just signed up"
        />
        <Tile
          label="Team sales"
          value={formatMoney(team.teamSales)}
          hint="Sold by your direct recruits"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Joining rewards" value={formatMoney(team.referralEarnings)} />
        <Tile label="Team-sales earnings" value={formatMoney(team.teamSalesEarnings)} />
        <Tile
          label="Total from your team"
          value={formatMoney(team.totalEarnings)}
          hint="Already in your balance"
        />
        <Tile
          label="Still to come"
          value={formatMoney(team.pendingTeamEarnings)}
          hint="Credited as those bundles are delivered"
        />
      </div>

      <Card
        title="Direct recruits"
        description="People who joined with your code"
        icon={Users}
        action={
          <span className="rounded-full bg-niki-orange/10 px-3 py-1.5 text-xs font-semibold text-niki-orange">
            Level 1 · you earn from their sales
          </span>
        }
      >
        <RecruitTable members={team.level1} level={1} />
      </Card>

      <Card
        title="Second level"
        description="People your recruits brought on board"
        icon={Share2}
        action={
          <span className="rounded-full bg-niki-ink/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/60">
            Level 2 · joining rewards only
          </span>
        }
      >
        <RecruitTable members={team.level2} level={2} />
      </Card>

      <p className="flex items-start gap-2.5 rounded-2xl bg-white px-5 py-4 text-xs leading-relaxed text-niki-ink/55 ring-1 ring-niki-edge">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-niki-ink/35" />
        <span>
          The programme stops at two levels. You earn a joining reward from your recruits and from
          theirs, and a sales commission from your direct recruits only. Nothing is paid on a sale
          that failed, was cancelled or was refunded, and nothing is ever paid twice.
        </span>
      </p>
    </div>
  );
}
