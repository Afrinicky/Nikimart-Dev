import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/agent/AgentUi";
import { TeamShell } from "@/components/agent/TeamShell";
import { TeamRange } from "@/components/agent/TeamRange";
import { TeamTable } from "@/components/agent/TeamTable";
import { StatTile } from "@/components/agent/TeamStats";
import { formatMoney } from "@/lib/format";
import { getTeamView } from "@/lib/data-bundles/team/metrics";
import { teamPageContext } from "@/lib/data-bundles/team/page-data";

export const metadata: Metadata = { title: "Team performance — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Who is selling, and what each of them is worth to the leader. */
export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const { agent, period, active, today } = await teamPageContext(searchParams);
  const team = await getTeamView(agent.id, period);

  const best = team.rows[0];
  const perMember =
    team.totals.members > 0 ? team.totals.sales / team.totals.members : 0;

  return (
    <TeamShell active="/agent/team/performance">
      <TeamRange
        active={active}
        label={period.label}
        from={period.from || today}
        to={period.to}
        today={today}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Team sales" value={formatMoney(team.totals.sales)} hint={period.label} />
        <StatTile
          label="Average per member"
          value={formatMoney(perMember)}
          hint={`across ${team.totals.members} ${team.totals.members === 1 ? "member" : "members"}`}
        />
        <StatTile
          label="Best this window"
          value={best ? formatMoney(best.sales) : formatMoney(0)}
          hint={best?.storeName ?? "Nobody has sold yet"}
          tone="orange"
        />
        <StatTile
          label="Income to you"
          value={formatMoney(team.totals.income)}
          hint={period.label}
          tone="success"
        />
      </div>

      <Card
        title="Team performance"
        description={`Ranked by sales · ${period.label}`}
        icon={TrendingUp}
      >
        <TeamTable
          rows={team.rows}
          empty="Share your link and the people who join with it appear here."
        />
      </Card>
    </TeamShell>
  );
}
