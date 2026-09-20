/**
 * Who is in a conversation.
 *
 * Three kinds of participant, and they do not live in one table: an agent is a
 * row in the bundle database, an admin is a user in the retail one, and a
 * visitor on a public page is nobody at all until they type their name. A
 * foreign key could never span those, so a participant is stored as a string
 * that says which kind it is and which one.
 *
 * Pure, because the same string is built when a message is sent, checked when
 * a token is minted, and compared when a room is drawn. One spelling.
 */

export const PARTICIPANT_KINDS = ["AGENT", "ADMIN", "VISITOR"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export interface Participant {
  kind: ParticipantKind;
  id: string;
}

/** "AGENT:ckt123". The id is opaque; only the kind is interpreted. */
export function participantKey(kind: ParticipantKind, id: string): string {
  return `${kind}:${id.trim()}`;
}

/** Read one back, or null when it is not one of ours. */
export function parseParticipant(raw: string | null | undefined): Participant | null {
  const value = (raw ?? "").trim();
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  if (!id || !(PARTICIPANT_KINDS as readonly string[]).includes(kind)) return null;
  // Ids come from cuid() or a random token; anything else is not one of ours.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return { kind: kind as ParticipantKind, id };
}

export function isAdmin(p: Participant | null): boolean {
  return p?.kind === "ADMIN";
}

/**
 * What kinds of room there are.
 *
 * SUPPORT is an enquiry from a public page, GROUP is a room an admin made for
 * a set of people, TEAM belongs to one leader and holds their own recruits,
 * SESSION is a scheduled meeting's room, and DIRECT is two people.
 */
export const CONVERSATION_KINDS = ["SUPPORT", "GROUP", "TEAM", "SESSION", "DIRECT"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const CONVERSATION_LABELS: Record<ConversationKind, string> = {
  SUPPORT: "Enquiry",
  GROUP: "Group",
  TEAM: "Team",
  SESSION: "Session",
  DIRECT: "Direct",
};

/**
 * Which rooms you may walk into, and which you must be let into.
 *
 * A team room and a session are the leader's to admit people to, and a direct
 * message is nobody else's business — so those are asked for. A group an admin
 * made is joined by being put in it, and an enquiry is between the person who
 * raised it and whoever answers.
 */
export function needsRequestToJoin(kind: ConversationKind): boolean {
  return kind === "TEAM" || kind === "SESSION";
}

/** A room's title when nobody gave it one. */
export function fallbackTitle(kind: ConversationKind, name: string): string {
  if (kind === "SUPPORT") return name ? `Enquiry from ${name}` : "Enquiry";
  if (kind === "DIRECT") return name || "Direct message";
  return name || CONVERSATION_LABELS[kind];
}
