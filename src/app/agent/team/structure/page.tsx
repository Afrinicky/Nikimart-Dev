import type { Metadata } from "next";
import { Network } from "lucide-react";
import { Card } from "@/components/agent/AgentUi";
import { TeamShell } from "@/components/agent/TeamShell";
import { TeamRange } from "@/components/agent/TeamRange";
import { TeamTree } from "@/components/agent/TeamTree";
import { StatTile } from "@/components/agent/TeamStats";
import { getTeamView } from "@/lib/data-bundles/team/metrics";
import { teamPageContext } from "@/lib/data-bundles/team/page-data";

export const metadata: Metadata = { title: "Team structure — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Who brought in whom — the question a ranking hides. */
export default async function TeamStructurePage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const { agent, period, active, today } = await teamPageContext(searchParams);
  const team = await getTeamView(agent.id, period);

  return (
    <TeamShell active="/agent/team/structure">
      <TeamRange
        active={active}
        label={period.label}
        from={period.from || today}
        to={period.to}
        today={today}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Direct recruits"
          value={String(team.totals.directMembers)}
          hint="Joined with your code"
          tone="orange"
        />
        <StatTile
          label="Second level"
          value={String(team.totals.indirectMembers)}
          hint="Brought in by your recruits"
          tone="trust"
        />
        <StatTile
          label="Building their own"
          value={String(team.totals.buildingMembers)}
          hint="Recruiting, not just selling"
          of={{ part: team.totals.buildingMembers, whole: Math.max(team.totals.members, 1) }}
        />
        <StatTile
          label="Whole team"
          value={String(team.totals.members)}
          hint="Both levels"
        />
      </div>

      <Card title="Team structure" description="Who brought in whom" icon={Network}>
        <TeamTree
          leaderName={agent.storeName}
          leaderCode={agent.code}
          nodes={team.rows}
          empty="Nobody has joined with your code yet."
        />
      </Card>
    </TeamShell>
  );
}
