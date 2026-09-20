import "server-only";
import { dataDb } from "@/lib/data-db";
import { memberLevelFor } from "@/lib/data-bundles/team/hierarchy";
import {
  fallbackTitle,
  parseParticipant,
  type ConversationKind,
  type Participant,
} from "@/lib/chat/identity";

/**
 * Rooms, and who is in them.
 *
 * One read decides access everywhere: the page that draws a room, the token
 * that lets a browser into it, and the action that posts to it all ask the
 * same question of the same function. A second opinion about who is in a room
 * is a room somebody walks into.
 */

export interface Conversation {
  id: string;
  kind: string;
  title: string;
  ownerKey: string;
  teamLeaderId: string | null;
  sessionId: string | null;
  visitorName: string;
  visitorPhone: string;
  status: string;
  lastMessageAt: Date | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  kind: true,
  title: true,
  ownerKey: true,
  teamLeaderId: true,
  sessionId: true,
  visitorName: true,
  visitorPhone: true,
  status: true,
  lastMessageAt: true,
  createdAt: true,
} as const;

export async function getConversation(id: string): Promise<Conversation | null> {
  return dataDb.dataConversation.findUnique({ where: { id }, select: SELECT }).catch(() => null);
}

export interface Access {
  ok: boolean;
  /** True when they run the room: a leader, the opener of a direct message. */
  isOwner: boolean;
  /** True when an admin is looking. Admins see every room but a direct one. */
  isAdmin: boolean;
  /** True when they are on the member list rather than merely entitled. */
  isMember: boolean;
  conversation: Conversation | null;
}

const DENIED: Access = {
  ok: false,
  isOwner: false,
  isAdmin: false,
  isMember: false,
  conversation: null,
};

/**
 * May this participant be in this room?
 *
 * Membership is the ordinary answer. The exceptions are deliberate: an admin
 * can reach any room the platform is responsible for, because an unanswerable
 * enquiry is worse than a private one — but never a direct message, which is
 * two people's and nobody else's. A team's leader always reaches their own
 * room even before they have been written onto its member list.
 */
export async function conversationAccess(
  conversationId: string,
  who: Participant | null,
): Promise<Access> {
  if (!who) return DENIED;

  const conversation = await getConversation(conversationId);
  if (!conversation) return DENIED;

  const key = `${who.kind}:${who.id}`;
  const membership = await dataDb.dataConversationMember
    .findUnique({
      where: { conversationId_participant: { conversationId, participant: key } },
      select: { role: true },
    })
    .catch(() => null);

  const isMember = Boolean(membership);
  const isOwner = conversation.ownerKey === key || membership?.role === "OWNER";

  if (who.kind === "ADMIN") {
    // Everything the platform answers for, and nothing that is two people's.
    const reachable = conversation.kind !== "DIRECT" || isMember;
    return { ok: reachable, isOwner, isAdmin: true, isMember, conversation };
  }

  if (isMember) return { ok: true, isOwner, isAdmin: false, isMember, conversation };

  // A leader reaches their own team's room whether or not anybody has written
  // them onto it — it is theirs by being the team's.
  if (
    who.kind === "AGENT" &&
    conversation.kind === "TEAM" &&
    conversation.teamLeaderId === who.id
  ) {
    return { ok: true, isOwner: true, isAdmin: false, isMember, conversation };
  }

  return { ...DENIED, conversation };
}

/**
 * Whether an agent is entitled to ask to join a room.
 *
 * Asking is not joining, but it should not be possible to ask your way into a
 * team you have nothing to do with — so a team's room can only be requested by
 * somebody actually in that leader's two levels.
 */
export async function mayRequestToJoin(
  conversation: Conversation,
  who: Participant,
): Promise<boolean> {
  if (who.kind === "ADMIN") return true;
  if (who.kind === "VISITOR") return false;
  if (conversation.kind === "GROUP") return true;
  if (conversation.teamLeaderId) {
    if (conversation.teamLeaderId === who.id) return true;
    return (await memberLevelFor(conversation.teamLeaderId, who.id)) !== null;
  }
  return false;
}

export interface ConversationSummary extends Conversation {
  unread: number;
  memberCount: number;
  /** The last thing said, for the list. */
  preview: string;
}

/** Every room this participant is in, most recently active first. */
export async function listConversationsFor(
  who: Participant,
  opts: { kind?: ConversationKind; take?: number } = {},
): Promise<ConversationSummary[]> {
  const key = `${who.kind}:${who.id}`;
  try {
    const rows = await dataDb.dataConversationMember.findMany({
      where: {
        participant: key,
        ...(opts.kind ? { conversation: { kind: opts.kind } } : {}),
      },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      take: opts.take ?? 50,
      select: {
        lastReadAt: true,
        conversation: {
          select: { ...SELECT, _count: { select: { members: true } } },
        },
      },
    });

    return await Promise.all(
      rows.map(async (r) => {
        const { _count, ...c } = r.conversation;
        return { ...c, ...(await decorate(c.id, r.lastReadAt, _count.members)) };
      }),
    );
  } catch {
    return [];
  }
}

/** Every open enquiry, for the admin's inbox. */
export async function listSupportConversations(
  who: Participant,
  take = 50,
): Promise<ConversationSummary[]> {
  try {
    const rows = await dataDb.dataConversation.findMany({
      where: { kind: "SUPPORT" },
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      take,
      select: { ...SELECT, _count: { select: { members: true } } },
    });
    const key = `${who.kind}:${who.id}`;
    const mine = await dataDb.dataConversationMember.findMany({
      where: { participant: key, conversationId: { in: rows.map((r) => r.id) } },
      select: { conversationId: true, lastReadAt: true },
    });
    const readBy = new Map(mine.map((m) => [m.conversationId, m.lastReadAt]));

    return await Promise.all(
      rows.map(async (r) => {
        const { _count, ...c } = r;
        return { ...c, ...(await decorate(c.id, readBy.get(c.id) ?? null, _count.members)) };
      }),
    );
  } catch {
    return [];
  }
}

/** The unread count and the last line, worked out once per room. */
async function decorate(
  conversationId: string,
  lastReadAt: Date | null,
  memberCount: number,
): Promise<{ unread: number; memberCount: number; preview: string }> {
  const [unread, last] = await Promise.all([
    dataDb.dataChatMessage
      .count({
        where: {
          conversationId,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
      })
      .catch(() => 0),
    dataDb.dataChatMessage
      .findFirst({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        select: { body: true, authorName: true },
      })
      .catch(() => null),
  ]);
  return {
    unread,
    memberCount,
    preview: last ? `${last.authorName}: ${last.body}`.slice(0, 120) : "",
  };
}

export interface ChatMessageRow {
  id: string;
  participant: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

/** What has been said in a room. Oldest first, because that is reading order. */
export async function getMessages(conversationId: string, take = 200): Promise<ChatMessageRow[]> {
  try {
    const rows = await dataDb.dataChatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, participant: true, authorName: true, body: true, createdAt: true },
    });
    return rows.reverse();
  } catch {
    return [];
  }
}

export interface MemberRow {
  participant: string;
  displayName: string;
  role: string;
  joinedAt: Date;
}

export async function getMembers(conversationId: string): Promise<MemberRow[]> {
  try {
    return await dataDb.dataConversationMember.findMany({
      where: { conversationId },
      orderBy: { joinedAt: "asc" },
      select: { participant: true, displayName: true, role: true, joinedAt: true },
    });
  } catch {
    return [];
  }
}

export interface JoinRequestRow {
  id: string;
  conversationId: string;
  conversationTitle: string;
  participant: string;
  displayName: string;
  message: string;
  status: string;
  createdAt: Date;
}

/** Who is waiting to be let into rooms this participant runs. */
export async function getPendingRequests(who: Participant): Promise<JoinRequestRow[]> {
  const key = `${who.kind}:${who.id}`;
  try {
    const rows = await dataDb.dataConversationRequest.findMany({
      where: {
        status: "pending",
        conversation:
          who.kind === "ADMIN"
            ? { kind: { in: ["GROUP", "SESSION", "TEAM"] } }
            : { OR: [{ ownerKey: key }, { teamLeaderId: who.id }] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        conversationId: true,
        participant: true,
        displayName: true,
        message: true,
        status: true,
        createdAt: true,
        conversation: { select: { title: true, kind: true } },
      },
    });
    return rows.map(({ conversation, ...r }) => ({
      ...r,
      conversationTitle:
        conversation.title || fallbackTitle(conversation.kind as ConversationKind, ""),
    }));
  } catch {
    return [];
  }
}

/** The participant behind a stored key, for rendering a name. */
export function readParticipant(raw: string): Participant | null {
  return parseParticipant(raw);
}
