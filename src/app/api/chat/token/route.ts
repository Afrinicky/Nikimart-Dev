import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createChatToken } from "@/lib/chat/ably";
import {
  conversationChannel,
  conversationIdFromChannel,
  sessionChannel,
  sessionIdFromChannel,
} from "@/lib/chat/channels";
import { participantKey, parseParticipant, type Participant } from "@/lib/chat/identity";
import { conversationAccess } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { sessionAccess } from "@/lib/data-bundles/team/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The door into a live room.
 *
 * A browser cannot reach the realtime service without a token, and a token is
 * only ever minted here — which makes this the one place membership has to be
 * proved. The channel is rebuilt from the room's id rather than taken from the
 * request, so a caller cannot ask for a room by naming it.
 *
 * Nothing about the conversation passes through here. It runs once when
 * somebody joins; the messages go browser to service and back, which is why a
 * chat can exist on this platform without a function held open.
 *
 * A visitor on a public page is not signed in and still has to be let in. They
 * carry a random token issued when they gave their name, and it is checked
 * against the room's member list exactly like anybody else's identity.
 */
export async function POST(request: Request) {
  let body: { sessionId?: unknown; conversationId?: unknown; visitorToken?: unknown } = {};
  try {
    body = ((await request.json()) as typeof body | null) ?? {};
  } catch {
    body = {};
  }

  const viewer = await currentViewer();
  const visitorToken =
    typeof body.visitorToken === "string" ? body.visitorToken.trim().slice(0, 64) : "";
  const who: Participant | null =
    viewer?.who ??
    (visitorToken ? parseParticipant(participantKey("VISITOR", visitorToken)) : null);

  if (!who) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // A token is a round trip to the realtime service, and the allowance is a
  // budget somebody could otherwise spend.
  const limit = await rateLimit(`chat-token:${who.kind}:${who.id}`, 120, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const conversationId =
    typeof body.conversationId === "string"
      ? (conversationIdFromChannel(body.conversationId) ?? body.conversationId.trim())
      : "";
  const sessionId =
    typeof body.sessionId === "string"
      ? (sessionIdFromChannel(body.sessionId) ?? body.sessionId.trim())
      : "";

  if (conversationId) {
    const access = await conversationAccess(conversationId, who);
    if (!access.ok) {
      return NextResponse.json({ error: "That room isn't yours to join." }, { status: 403 });
    }
    return mint(who, conversationChannel(conversationId));
  }

  if (sessionId) {
    // Sessions predate rooms and keep their own membership rule, which is the
    // team's rather than a member list.
    if (who.kind !== "AGENT") {
      return NextResponse.json({ error: "That session isn't yours." }, { status: 403 });
    }
    const access = await sessionAccess(sessionId, who.id);
    if (!access.ok || !access.session) {
      return NextResponse.json({ error: "That session isn't yours to join." }, { status: 403 });
    }
    if (access.session.status === "ended") {
      return NextResponse.json({ error: "That session has ended." }, { status: 409 });
    }
    return mint(who, sessionChannel(sessionId));
  }

  return NextResponse.json({ error: "Which room?" }, { status: 400 });
}

async function mint(who: Participant, channel: string) {
  const minted = await createChatToken(participantKey(who.kind, who.id), channel);
  if (!minted.ok) {
    return NextResponse.json({ error: minted.error }, { status: 503 });
  }
  return NextResponse.json(minted.token, { headers: { "Cache-Control": "no-store" } });
}
