import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { rateLimit } from "@/lib/rate-limit";
import { createChatToken } from "@/lib/chat/ably";
import { sessionChannel, sessionIdFromChannel } from "@/lib/chat/channels";
import { sessionAccess } from "@/lib/data-bundles/team/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The door into a live room.
 *
 * A browser cannot talk to the realtime service without a token, and a token
 * is only ever minted here — which makes this the one place team membership
 * has to be proved. The channel is rebuilt from the session id rather than
 * taken from the request, so a caller cannot ask for a room by naming it.
 *
 * Nothing about the conversation passes through this route. It runs once when
 * somebody joins; the messages themselves go browser to service and back,
 * which is the whole reason a chat can exist here without a function held open
 * or a database row per line.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const agent = await getAgentForUser(session.user.id);
  if (!agent) {
    return NextResponse.json({ error: "You don't have an agent account." }, { status: 403 });
  }

  // Cheap to call and cheap to abuse otherwise: a token is a round trip to the
  // realtime service, and the free tier is a budget somebody could spend.
  const limit = await rateLimit(`chat-token:${agent.id}`, 60, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let sessionId = "";
  try {
    const body: unknown = await request.json();
    const raw = (body as { sessionId?: unknown; channel?: unknown } | null) ?? {};
    sessionId =
      typeof raw.sessionId === "string"
        ? raw.sessionId.trim()
        : typeof raw.channel === "string"
          ? (sessionIdFromChannel(raw.channel) ?? "")
          : "";
  } catch {
    sessionId = "";
  }
  if (!sessionId) {
    return NextResponse.json({ error: "Which session?" }, { status: 400 });
  }

  const access = await sessionAccess(sessionId, agent.id);
  if (!access.ok || !access.session) {
    return NextResponse.json({ error: "That session isn't yours to join." }, { status: 403 });
  }
  if (access.session.status === "ended") {
    return NextResponse.json({ error: "That session has ended." }, { status: 409 });
  }

  const minted = await createChatToken(agent.id, sessionChannel(sessionId));
  if (!minted.ok) {
    return NextResponse.json({ error: minted.error }, { status: 503 });
  }

  return NextResponse.json(minted.token, {
    headers: { "Cache-Control": "no-store" },
  });
}
