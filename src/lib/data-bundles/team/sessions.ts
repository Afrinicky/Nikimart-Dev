import "server-only";
import { dataDb } from "@/lib/data-db";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { memberLevelFor } from "@/lib/data-bundles/team/hierarchy";

/**
 * Sessions a leader holds with their team.
 *
 * The row is the durable part — when it was held, who turned up, what was
 * decided. The conversation is carried by the realtime service and only
 * reaches this database as a transcript once it is over.
 */

export type SessionStatus = "scheduled" | "live" | "ended";

export interface TeamSession {
  id: string;
  leaderId: string;
  title: string;
  agenda: string;
  status: string;
  startsAt: Date;
  openedAt: Date | null;
  endedAt: Date | null;
  attendeeCount: number;
}

const SELECT = {
  id: true,
  leaderId: true,
  title: true,
  agenda: true,
  status: true,
  startsAt: true,
  openedAt: true,
  endedAt: true,
  _count: { select: { attendees: true } },
} as const;

type Row = {
  id: string;
  leaderId: string;
  title: string;
  agenda: string;
  status: string;
  startsAt: Date;
  openedAt: Date | null;
  endedAt: Date | null;
  _count: { attendees: number };
};

function toSession(r: Row): TeamSession {
  const { _count, ...rest } = r;
  return { ...rest, attendeeCount: _count.attendees };
}

/** Everything this leader has scheduled, newest first. */
export async function getLeaderSessions(leaderId: string, take = 20): Promise<TeamSession[]> {
  try {
    const rows = await dataDb.dataTeamSession.findMany({
      where: { leaderId },
      orderBy: { startsAt: "desc" },
      take,
      select: SELECT,
    });
    return rows.map(toSession);
  } catch {
    return [];
  }
}

/**
 * The sessions a member should see: their own recruiter's.
 *
 * Only the direct leader, for the same reason announcements are. Somebody
 * being called into two rooms by two levels of upline is not mentorship.
 */
export async function getSessionsForMember(agentId: string, take = 10): Promise<TeamSession[]> {
  const me = await dataDb.dataAgent
    .findUnique({ where: { id: agentId }, select: { referredById: true } })
    .catch(() => null);
  if (!me?.referredById) return [];
  return getLeaderSessions(me.referredById, take);
}

/**
 * Whether this agent may be in this session's room, and in what capacity.
 *
 * The one check that matters: it gates the token, so a room cannot be joined
 * by anybody the leader has not actually recruited.
 */
export async function sessionAccess(
  sessionId: string,
  agentId: string,
): Promise<{ ok: boolean; isHost: boolean; session: TeamSession | null }> {
  const row = await dataDb.dataTeamSession
    .findUnique({ where: { id: sessionId }, select: SELECT })
    .catch(() => null);
  if (!row) return { ok: false, isHost: false, session: null };

  const session = toSession(row);
  if (session.leaderId === agentId) return { ok: true, isHost: true, session };

  const level = await memberLevelFor(session.leaderId, agentId);
  return { ok: level !== null, isHost: false, session };
}

export interface SessionAttendee {
  agentId: string;
  storeName: string;
  ownerName: string;
  joinedAt: Date;
}

/** Who turned up. */
export async function getSessionAttendees(sessionId: string): Promise<SessionAttendee[]> {
  try {
    const rows = await dataDb.dataTeamSessionAttendee.findMany({
      where: { sessionId },
      orderBy: { joinedAt: "asc" },
      select: {
        agentId: true,
        joinedAt: true,
        agent: { select: { storeName: true, userId: true } },
      },
    });
    return await Promise.all(
      rows.map(async (r) => ({
        agentId: r.agentId,
        storeName: r.agent?.storeName ?? "Removed agent",
        ownerName: (await getAgentUser(r.agent?.userId ?? ""))?.name ?? "",
        joinedAt: r.joinedAt,
      })),
    );
  } catch {
    return [];
  }
}

export interface SessionMessage {
  id: string;
  authorName: string;
  body: string;
  saidAt: Date;
  agentId: string | null;
}

/** What was said, once the session is over. */
export async function getSessionTranscript(sessionId: string): Promise<SessionMessage[]> {
  try {
    return await dataDb.dataTeamSessionMessage.findMany({
      where: { sessionId },
      orderBy: { saidAt: "asc" },
      take: 500,
      select: { id: true, authorName: true, body: true, saidAt: true, agentId: true },
    });
  } catch {
    return [];
  }
}
