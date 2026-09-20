import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, formatWhen } from "@/components/agent/AgentUi";
import { SessionRoom } from "@/components/agent/SessionRoom";
import { LiveChat } from "@/components/chat/LiveChat";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { openSession } from "@/lib/data-bundles/team/session-actions";
import {
  getSessionAttendees,
  getSessionTranscript,
  sessionAccess,
} from "@/lib/data-bundles/team/sessions";

export const metadata: Metadata = { title: "Session — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One session: the room while it is open, the record once it is not.
 *
 * Access is checked here and again when the token is minted. The page check
 * keeps somebody from reading a transcript that is not theirs; the token check
 * keeps them out of the conversation itself, which is the one that has to hold
 * even if a link is shared.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const { id } = await params;
  const access = await sessionAccess(id, agent.id);
  if (!access.ok || !access.session) notFound();

  const s = access.session;
  const [attendees, transcript, owner] = await Promise.all([
    getSessionAttendees(id),
    s.status === "ended" ? getSessionTranscript(id) : Promise.resolve([]),
    getAgentUser(agent.userId),
  ]);

  const me = { agentId: agent.id, name: owner?.name || agent.storeName };
  const history = transcript.map((m) => ({
    id: m.id,
    agentId: m.agentId,
    authorName: m.authorName,
    body: m.body,
    saidAt: m.saidAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <ActionLink
        href="/agent/team/sessions"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </ActionLink>

      <AgentPageHeading
        title={s.title}
        subtitle={`${formatWhen(s.startsAt)}${access.isHost ? " · you are hosting" : ""}`}
      />

      {s.agenda ? (
        <p className="whitespace-pre-wrap rounded-2xl bg-white px-5 py-4 text-sm text-niki-ink/75 ring-1 ring-niki-edge">
          {s.agenda}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          {s.status === "scheduled" ? (
            <div className="rounded-2xl bg-white px-5 py-10 text-center ring-1 ring-niki-edge">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
                <CalendarClock className="h-5 w-5" />
              </span>
              <p className="mt-3 font-display font-bold text-niki-ink">Not open yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">
                {access.isHost
                  ? "Open the room when you are ready and your team can join."
                  : "Your leader hasn't opened the room yet."}
              </p>
              {access.isHost ? (
                <form action={openSession} className="mt-4">
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="niki-press niki-focus rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white"
                  >
                    Open the room
                  </button>
                </form>
              ) : null}
            </div>
          ) : s.status === "live" ? (
            <SessionRoom sessionId={s.id} me={me} isHost={access.isHost} history={[]} />
          ) : (
            <LiveChat sessionId={s.id} me={me} readOnly history={history} />
          )}
        </div>

        <Card title="Who came" icon={Users}>
          {attendees.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-4 py-6 text-center text-sm text-niki-ink/55">
              Nobody yet.
            </p>
          ) : (
            <ul className="divide-y divide-niki-edge">
              {attendees.map((a) => (
                <li key={a.agentId} className="py-2.5">
                  <p className="truncate text-sm font-medium text-niki-ink">{a.storeName}</p>
                  <p className="truncate text-[11px] text-niki-ink/45">
                    {a.ownerName ? `${a.ownerName} · ` : ""}
                    {formatWhen(a.joinedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
