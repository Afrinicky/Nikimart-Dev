import type { Metadata } from "next";
import { Activity, Coins, HandCoins, ReceiptText } from "lucide-react";
import { Card, formatWhen } from "@/components/agent/AgentUi";
import { TeamShell } from "@/components/agent/TeamShell";
import { ActivityBar, StatTile } from "@/components/agent/TeamStats";
import { TeamRange } from "@/components/agent/TeamRange";
import { formatMoney } from "@/lib/format";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { referralRewardsLine } from "@/lib/data-bundles/referral-rules";
import { registrationFeeStatus } from "@/lib/data-bundles/registration-fee";
import { getTeamIncomeEntries, getTeamView } from "@/lib/data-bundles/team/metrics";
import { getTeamActivity } from "@/lib/data-bundles/team/communication";
import { TEAM_INCOME_LABELS, type TeamIncomeType } from "@/lib/data-bundles/team/rules";
import { teamPageContext } from "@/lib/data-bundles/team/page-data";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "My Team — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * How the team is doing, and what it is worth.
 *
 * Every figure is read from records that already exist: sales from the orders
 * members sold, income from the leader's own ledger where each credit already
 * carries the agent whose activity produced it. The numbers here and the
 * balance on the wallet are the same money.
 */
export default async function AgentTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const { agent, period, active, today } = await teamPageContext(searchParams);

  const [team, entries, config, activity] = await Promise.all([
    getTeamView(agent.id, period),
    getTeamIncomeEntries(agent.id, period, { take: 8 }),
    getReferralConfig(),
    getTeamActivity(agent.id, 10),
  ]);

  const fee = registrationFeeStatus(agent);
  const byId = new Map(team.rows.map((r) => [r.id, r.storeName]));

  return (
    <TeamShell active="/agent/team">
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

      <TeamRange
        active={active}
        label={period.label}
        from={period.from || today}
        to={period.to}
        today={today}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Team members"
          value={String(team.totals.members)}
          hint={`${team.totals.directMembers} direct · ${team.totals.indirectMembers} second level`}
          of={{ part: team.totals.directMembers, whole: Math.max(team.totals.members, 1) }}
          tone="orange"
        />
        <StatTile
          label="Selling"
          value={String(team.totals.activeMembers)}
          hint={`of ${team.totals.members} in the last 30 days`}
          of={{ part: team.totals.activeMembers, whole: Math.max(team.totals.members, 1) }}
          tone="success"
        />
        <StatTile
          label="New members"
          value={String(team.totals.newMembers)}
          hint="Joined in the last 30 days"
          delta={team.totals.growth}
          tone="trust"
        />
        <StatTile
          label="Building their own"
          value={String(team.totals.buildingMembers)}
          hint="Members who have recruited"
          of={{ part: team.totals.buildingMembers, whole: Math.max(team.totals.members, 1) }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Team sales" value={formatMoney(team.totals.sales)} hint={period.label} />
        <StatTile label="Orders" value={String(team.totals.orders)} hint={period.label} />
        <StatTile
          label="Customers"
          value={String(team.totals.customers)}
          hint="Buyers the team served"
        />
        <StatTile
          label="Income to you"
          value={formatMoney(team.totals.income)}
          hint="Already in your balance"
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Where your team stands" description="Everyone, by how they are trading" icon={Activity}>
          <ActivityBar counts={team.totals.activity} />
        </Card>

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
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Team activity" description="What they have been doing" icon={Activity}>
          {activity.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
              Nothing yet. Activity shows up here as your team trades.
            </p>
          ) : (
            <ul className="divide-y divide-niki-edge">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-niki-ink/80">{a.text}</p>
                    <p className="truncate text-[11px] text-niki-ink/45">{formatWhen(a.at)}</p>
                  </div>
                  {a.amount === undefined ? null : (
                    <span
                      className={cn(
                        "shrink-0 font-figures text-sm font-bold",
                        a.kind === "earned" ? "text-niki-success" : "text-niki-ink/60",
                      )}
                    >
                      {a.kind === "earned" ? "+" : ""}
                      {formatMoney(a.amount)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Where the income came from"
          description={`Credits to your balance · ${period.label}`}
          icon={ReceiptText}
        >
          {entries.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
              Nothing from your team in this window yet.
            </p>
          ) : (
            <ul className="divide-y divide-niki-edge">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-niki-ink">
                      {TEAM_INCOME_LABELS[e.type as TeamIncomeType] ?? e.type}
                      {e.sourceAgentId && byId.get(e.sourceAgentId)
                        ? ` · ${byId.get(e.sourceAgentId)}`
                        : ""}
                    </p>
                    <p className="truncate text-[11px] text-niki-ink/45">
                      {formatWhen(e.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-figures text-sm font-bold text-niki-success">
                    +{formatMoney(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="flex items-start gap-2.5 rounded-2xl bg-white px-5 py-4 text-xs leading-relaxed text-niki-ink/55 ring-1 ring-niki-edge">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-niki-ink/35" />
        <span>
          The programme stops at two levels. You earn a joining reward from your recruits and from
          theirs, and a sales commission from your direct recruits only. Nothing is paid on a sale
          that failed, was cancelled or was refunded, and nothing is ever paid twice.
        </span>
      </p>
    </TeamShell>
  );
}
