import "server-only";
import Ably from "ably";
import { SESSION_CAPABILITY } from "@/lib/chat/channels";

/**
 * Nickimart live chat: the realtime side of it.
 *
 * Browsers talk to Ably directly, so no serverless function is held open for
 * the length of a conversation and no database row is written per message.
 * This module exists only to mint the short-lived token that lets one browser
 * into one channel.
 *
 * The API key never leaves the server. A token request is signed here, scoped
 * to a single channel and a single agent, and expires on its own — so a token
 * that leaks is a token to one room that is already closing.
 */

function apiKey(): string | undefined {
  const key = process.env.ABLY_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

/** Whether live chat can work at all on this deployment. */
export function isChatConfigured(): boolean {
  return Boolean(apiKey());
}

/** Long enough for a session, short enough that a stolen one expires. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

export type ChatTokenResult =
  | { ok: true; token: unknown }
  | { ok: false; error: string };

/**
 * A token for one agent, in one channel, and nothing else.
 *
 * The capability is built here rather than taken from the request: a caller
 * that could name its own capabilities could name somebody else's channel.
 */
export async function createChatToken(
  agentId: string,
  channel: string,
): Promise<ChatTokenResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: "Live chat isn't set up on this deployment." };

  try {
    const rest = new Ably.Rest({ key });
    const token = await rest.auth.createTokenRequest({
      clientId: agentId,
      ttl: TOKEN_TTL_MS,
      capability: { [channel]: [...SESSION_CAPABILITY] },
    });
    return { ok: true, token };
  } catch {
    return { ok: false, error: "Couldn't start live chat. Please try again." };
  }
}
