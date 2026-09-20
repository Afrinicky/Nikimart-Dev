import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, Radio, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, formatWhen } from "@/components/agent/AgentUi";
import { SessionScheduler } from "@/components/agent/SessionScheduler";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { isChatConfigured } from "@/lib/chat/ably";
import { openSession } from "@/lib/data-bundles/team/session-actions";
import { getLeaderSessions, getSessionsForMember } from "@/lib/data-bundles/team/sessions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Team sessions — Agent — Nickimart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  scheduled: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  live: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/25",
  ended: "bg-niki-ink/8 text-niki-ink/55 ring-1 ring-niki-ink/15",
};

const LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  live: "Live now",
  ended: "Ended",
};

/**
 * Sessions a leader holds, and the ones a member is invited to.
 *
 * One screen for both, because they are the same list read from two sides:
 * what you are hosting sits above what you have been called to, and an agent
 * who does both sees both without choosing a mode.
 */
export default async function TeamSessionsPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const [hosting, invited] = await Promise.all([
    getLeaderSessions(agent.id),
    getSessionsForMember(agent.id),
  ]);

  const row = (s: (typeof hosting)[number], isHost: boolean) => (
    <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-niki-edge py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-niki-ink">
          {s.title}
          <span
            className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", TONES[s.status])}
          >
            {LABELS[s.status] ?? s.status}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-niki-ink/55">
          {formatWhen(s.startsAt)}
          {s.attendeeCount > 0
            ? ` · ${s.attendeeCount} ${s.attendeeCount === 1 ? "attended" : "attended"}`
            : ""}
        </p>
      </div>

      {isHost && s.status === "scheduled" ? (
        <form action={openSession}>
          <input type="hidden" name="id" value={s.id} />
          <button
            type="submit"
            className="niki-press niki-focus rounded-xl bg-niki-orange px-4 py-2 text-xs font-bold text-white"
          >
            Open the room
          </button>
        </form>
      ) : null}

      <ActionLink
        href={`/agent/team/sessions/${s.id}`}
        className="niki-focus rounded-xl bg-white px-4 py-2 text-xs font-bold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
      >
        {s.status === "ended" ? "Read it" : s.status === "live" ? "Join" : "Open"}
      </ActionLink>
    </li>
  );

  return (
    <div className="space-y-5">
      <ActionLink
        href="/agent/team"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to my team
      </ActionLink>

      <AgentPageHeading title="Team sessions" subtitle="Get your team in one room.">
        <SessionScheduler />
      </AgentPageHeading>

      {!isChatConfigured() ? (
        <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Live chat isn&apos;t set up on this deployment yet, so rooms cannot be opened.
        </p>
      ) : null}

      <Card title="You are hosting" icon={Radio}>
        {hosting.length === 0 ? (
          <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
            Nothing scheduled. A session is the fastest way to get everyone the same answer.
          </p>
        ) : (
          <ul>{hosting.map((s) => row(s, true))}</ul>
        )}
      </Card>

      {invited.length > 0 ? (
        <Card title="You are invited to" description="From your own recruiter" icon={Users}>
          <ul>{invited.map((s) => row(s, false))}</ul>
        </Card>
      ) : null}
    </div>
  );
}
