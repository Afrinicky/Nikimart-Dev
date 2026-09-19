import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Coins,
  HandCoins,
  ReceiptText,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, formatWhen } from "@/components/agent/AgentUi";
import { ReferralShare } from "@/components/agent/ReferralShare";
import { TeamRange } from "@/components/agent/TeamRange";
import { TeamTable } from "@/components/agent/TeamTable";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { referralLink, referralRewardsLine } from "@/lib/data-bundles/referral-rules";
import { registrationFeeStatus } from "@/lib/data-bundles/registration-fee";
import { dayKey, resolveWindow } from "@/lib/data-bundles/overview-window";
import { getTeamIncomeEntries, getTeamView } from "@/lib/data-bundles/team/metrics";
import { TEAM_INCOME_LABELS, type TeamIncomeType } from "@/lib/data-bundles/team/rules";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "My Team — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * A leader's own team: who is in it, what they are doing, and what they are
 * worth.
 *
 * Two levels and no more, because that is the programme — direct recruits, and
 * the people those recruits bring in.
 *
 * Every figure is read from records that already exist. Sales come from the
 * orders the members sold; income comes from the leader's own ledger, where
 * each referral and team-sales credit already carries the agent whose activity
 * produced it. So the numbers on this screen and the balance on the wallet are
 * the same money, and reconcile line for line.
 */
function Tile({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "success" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    orange: "text-niki-orange",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45">
        {label}
      </p>
      <p className={cn("mt-2 font-figures text-xl font-bold sm:text-2xl", tones[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

export default async function AgentTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const params = await searchParams;
  const period = resolveWindow(params);
  // "Today" is a one-day custom range rather than a preset of its own, so the
  // pill has to recognise itself.
  const today = dayKey(new Date());
  const active =
    period.key === "custom" && period.from === today && period.to === today ? "today" : period.key;

  const [team, entries, config] = await Promise.all([
    getTeamView(agent.id, period),
    getTeamIncomeEntries(agent.id, period, { take: 8 }),
    getReferralConfig(),
  ]);

  const fee = registrationFeeStatus(agent);
  const link = referralLink(siteUrl(), agent.code);
  const byId = new Map(team.rows.map((r) => [r.id, r.storeName]));

  return (
    <div className="space-y-5">
      <AgentPageHeading title="My team" subtitle="Recruit agents and earn from what they sell.">
        <ActionLink
          href="/agent/team/new"
          className="flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2 text-xs font-semibold text-white hover:bg-niki-orange-light"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add an agent
        </ActionLink>
      </AgentPageHeading>

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

      {/* The team at a glance. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Team members"
          value={String(team.totals.members)}
          hint={`${team.totals.directMembers} direct · ${team.totals.indirectMembers} second level`}
        />
        <Tile
          label="Active"
          value={String(team.totals.activeMembers)}
          hint={`${team.totals.members - team.totals.activeMembers} not selling`}
          tone="success"
        />
        <Tile
          label="New members"
          value={String(team.totals.newMembers)}
          hint={
            team.totals.growth === null
              ? "Joined in the last 30 days"
              : `${team.totals.growth >= 0 ? "+" : ""}${team.totals.growth}% growth on last month`
          }
        />
        <Tile
          label="Building their own"
          value={String(team.totals.buildingMembers)}
          hint="Members who have recruited"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Team sales" value={formatMoney(team.totals.sales)} hint={period.label} />
        <Tile label="Orders" value={String(team.totals.orders)} hint={period.label} />
        <Tile
          label="Customers"
          value={String(team.totals.customers)}
          hint="Buyers the team served"
        />
        <Tile
          label="Income to you"
          value={formatMoney(team.totals.income)}
          hint="Already in your balance"
          tone="success"
        />
      </div>

      <Card
        title="Team performance"
        description={`Who is selling · ${period.label}`}
        icon={TrendingUp}
      >
        <TeamTable
          rows={team.rows}
          empty="Share your link and the people who join with it appear here."
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ReferralShare code={agent.code} link={link} />
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

      {/* The lines behind the total. A figure a leader cannot break down is one
          they have to take on trust, and this is their money. */}
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
                  <p className="truncate text-[11px] text-niki-ink/45">{formatWhen(e.createdAt)}</p>
                </div>
                <span className="shrink-0 font-figures text-sm font-bold text-niki-success">
                  +{formatMoney(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
