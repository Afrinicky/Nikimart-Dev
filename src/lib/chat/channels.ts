/**
 * What a realtime channel is called, and who is entitled to it.
 *
 * Pure, because the name is built in the browser when connecting and checked
 * on the server when a token is minted. Two spellings of the same channel
 * would mean a token that grants nothing, so there is one spelling.
 *
 * Every name carries the thing it belongs to, because a token is issued for
 * one channel and nothing else — a name that could not be tied back to an
 * ownership check would be a channel anybody could join.
 */

export const CHANNEL_PREFIX = "nikimart";

/** The room for one conversation — an enquiry, a team, a group, two people. */
export function conversationChannel(conversationId: string): string {
  return `${CHANNEL_PREFIX}:room:${conversationId}`;
}

/** The conversation a room channel refers to, or null when it is not one. */
export function conversationIdFromChannel(channel: string): string | null {
  const match = /^nikimart:room:([A-Za-z0-9_-]+)$/.exec(channel.trim());
  return match ? match[1] : null;
}

/** The room for one team session. */
export function sessionChannel(sessionId: string): string {
  return `${CHANNEL_PREFIX}:session:${sessionId}`;
}

/** The id a session channel refers to, or null when it is not one. */
export function sessionIdFromChannel(channel: string): string | null {
  const match = /^nikimart:session:([A-Za-z0-9_-]+)$/.exec(channel.trim());
  return match ? match[1] : null;
}

/** What a member may do in a session room: read it, and speak in it. */
export const SESSION_CAPABILITY = ["subscribe", "publish", "presence"] as const;

/** The one event name messages are published under. */
export const CHAT_EVENT = "say";
