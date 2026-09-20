"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { recordNotification } from "@/lib/data-bundles/notifications";
import {
  fallbackTitle,
  participantKey,
  parseParticipant,
  needsRequestToJoin,
  type ConversationKind,
} from "@/lib/chat/identity";
import {
  conversationAccess,
  getConversation,
  mayRequestToJoin,
} from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

/**
 * Everything that changes a room.
 *
 * Every action works out who is asking from the session rather than from the
 * form, and checks the same access rule the page and the token do. A write
 * that trusted an id from the browser would be a room anybody could post into.
 */

export type ChatState = { ok?: boolean; error?: string; message?: string; id?: string };

function revalidateChat(conversationId?: string) {
  revalidatePath("/admin/data/chatroom");
  revalidatePath("/agent/chatroom");
  if (conversationId) {
    revalidatePath(`/admin/data/chatroom/${conversationId}`);
    revalidatePath(`/agent/chatroom/${conversationId}`);
  }
}

// ---------------------------------------------------------------------------
// Saying something
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  conversationId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2000),
  /** A visitor's own token, for somebody not signed in. */
  visitorToken: z.string().trim().max(64).optional(),
});

/**
 * Keep a message.
 *
 * The realtime service has already carried it to whoever was looking; this is
 * the copy that is still there next week. Called by the sender's own browser
 * straight after publishing, so a message is delivered whether or not this
 * write succeeds — and stored whether or not anybody was watching.
 */
export async function saveMessage(input: z.infer<typeof sendSchema>): Promise<ChatState> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "Nothing to save." };

  const viewer = await currentViewer();
  const who = viewer?.who ?? visitorParticipant(parsed.data.visitorToken);
  if (!who) return { error: "Sign in first." };

  const access = await conversationAccess(parsed.data.conversationId, who);
  if (!access.ok) return { error: "That room isn't yours." };
  if (access.conversation?.status === "closed") return { error: "That conversation is closed." };

  const limit = await rateLimit(`chat-send:${who.kind}:${who.id}`, 240, 60 * 60_000);
  if (!limit.ok) {
    return { error: `Slow down a moment — try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const name = viewer?.name || access.conversation?.visitorName || "Someone";
  try {
    await dataDb.$transaction([
      dataDb.dataChatMessage.create({
        data: {
          conversationId: parsed.data.conversationId,
          participant: participantKey(who.kind, who.id),
          authorName: name,
          body: parsed.data.body,
        },
      }),
      dataDb.dataConversation.update({
        where: { id: parsed.data.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch {
    return { error: "Couldn't save that message." };
  }

  return { ok: true };
}

/** Mark a room read up to now, for the unread counts. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer || !conversationId) return;
  try {
    await dataDb.dataConversationMember.updateMany({
      where: { conversationId, participant: viewer.key },
      data: { lastReadAt: new Date() },
    });
  } catch {
    // Not a member, or not migrated.
  }
}

// ---------------------------------------------------------------------------
// Enquiries from the public pages
// ---------------------------------------------------------------------------

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(60),
  phone: z.string().trim().min(9, "Enter a number we can call you on."),
});

export interface StartedEnquiry {
  ok: true;
  conversationId: string;
  visitorToken: string;
  name: string;
}

/**
 * Open an enquiry from a public page.
 *
 * The name and number are asked for first, because an answer nobody can
 * deliver is not an answer: a visitor who closes the tab is unreachable
 * otherwise, and half of what people ask a bundle shop is about an order
 * somebody has to look up.
 *
 * The token returned is the visitor's only claim on the conversation. It is
 * random, kept by their browser, and it is what lets them come back to the
 * same thread without an account.
 */
export async function startEnquiry(
  input: z.infer<typeof enquirySchema>,
): Promise<StartedEnquiry | { ok: false; error: string }> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const phone = parseGhPhone(parsed.data.phone);
  if (!phone.ok) return { ok: false, error: phone.message };

  const limit = await rateLimit(`enquiry:${phone.local}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `You've started a few of these — try again in ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const visitorToken = randomBytes(16).toString("hex");
  try {
    const conversation = await dataDb.dataConversation.create({
      data: {
        kind: "SUPPORT",
        title: fallbackTitle("SUPPORT", parsed.data.name),
        visitorName: parsed.data.name,
        visitorPhone: phone.local,
        lastMessageAt: new Date(),
        members: {
          create: {
            participant: participantKey("VISITOR", visitorToken),
            displayName: parsed.data.name,
            role: "OWNER",
          },
        },
      },
      select: { id: true },
    });

    await recordNotification({
      kind: "SYSTEM",
      tone: "info",
      title: `${parsed.data.name} started a chat`,
      body: `${phone.local} · waiting for a reply.`,
      href: `/admin/data/chatroom/${conversation.id}`,
      dedupeKey: `ENQUIRY:${conversation.id}`,
    });

    revalidateChat();
    return { ok: true, conversationId: conversation.id, visitorToken, name: parsed.data.name };
  } catch {
    return { ok: false, error: "Couldn't start that chat. Please try again." };
  }
}

function visitorParticipant(token: string | undefined) {
  return token ? parseParticipant(participantKey("VISITOR", token)) : null;
}

// ---------------------------------------------------------------------------
// Rooms an admin makes
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  title: z.string().trim().min(3, "Give the room a name.").max(80),
  /** all-agents | chosen */
  audience: z.enum(["all-agents", "chosen"]),
  agentIds: z.array(z.string().trim().min(1)).max(500).optional(),
});

/** Create a group room and put people in it. Admins only. */
export async function createGroupRoom(
  _prev: ChatState,
  fd: FormData,
): Promise<ChatState> {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") return { error: "Only an admin can create a room." };

  const parsed = roomSchema.safeParse({
    title: fd.get("title"),
    audience: fd.get("audience") ?? "chosen",
    agentIds: fd.getAll("agentIds").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  try {
    const agents =
      parsed.data.audience === "all-agents"
        ? await dataDb.dataAgent.findMany({
            where: { status: "active" },
            select: { id: true, storeName: true },
          })
        : await dataDb.dataAgent.findMany({
            where: { id: { in: parsed.data.agentIds ?? [] } },
            select: { id: true, storeName: true },
          });

    const conversation = await dataDb.dataConversation.create({
      data: {
        kind: "GROUP",
        title: parsed.data.title,
        ownerKey: viewer.key,
        members: {
          create: [
            { participant: viewer.key, displayName: viewer.name, role: "OWNER" },
            ...agents.map((a) => ({
              participant: participantKey("AGENT", a.id),
              displayName: a.storeName,
            })),
          ],
        },
      },
      select: { id: true },
    });

    revalidateChat();
    return { ok: true, id: conversation.id, message: `Room created with ${agents.length} members.` };
  } catch {
    return { error: "Couldn't create that room." };
  }
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

/**
 * Open a one-to-one, or find the one that already exists.
 *
 * Two people have one thread, not one per time somebody clicked "message".
 * The pair is looked up before anything is created, so the second click lands
 * back in the first conversation.
 */
export async function openDirect(otherKey: string): Promise<ChatState> {
  const viewer = await currentViewer();
  if (!viewer) return { error: "Sign in first." };

  const other = parseParticipant(otherKey);
  if (!other || other.kind === "VISITOR") return { error: "That isn't somebody you can message." };
  const theirKey = participantKey(other.kind, other.id);
  if (theirKey === viewer.key) return { error: "That is you." };

  try {
    const existing = await dataDb.dataConversation.findFirst({
      where: {
        kind: "DIRECT",
        AND: [
          { members: { some: { participant: viewer.key } } },
          { members: { some: { participant: theirKey } } },
        ],
      },
      select: { id: true },
    });
    if (existing) return { ok: true, id: existing.id };

    const name = await displayNameFor(other.kind, other.id);
    const created = await dataDb.dataConversation.create({
      data: {
        kind: "DIRECT",
        title: "",
        ownerKey: viewer.key,
        members: {
          create: [
            { participant: viewer.key, displayName: viewer.name, role: "OWNER" },
            { participant: theirKey, displayName: name },
          ],
        },
      },
      select: { id: true },
    });
    revalidateChat();
    return { ok: true, id: created.id };
  } catch {
    return { error: "Couldn't open that conversation." };
  }
}

async function displayNameFor(kind: string, id: string): Promise<string> {
  if (kind !== "AGENT") return "Nickimart";
  const agent = await dataDb.dataAgent
    .findUnique({ where: { id }, select: { storeName: true } })
    .catch(() => null);
  return agent?.storeName ?? "Agent";
}

// ---------------------------------------------------------------------------
// Asking to be let in
// ---------------------------------------------------------------------------

/** Ask the owner of a room to admit you. */
export async function requestToJoin(
  _prev: ChatState,
  fd: FormData,
): Promise<ChatState> {
  const viewer = await currentViewer();
  if (!viewer) return { error: "Sign in first." };

  const conversationId = String(fd.get("conversationId") ?? "").trim();
  const message = String(fd.get("message") ?? "").trim().slice(0, 300);
  const conversation = await getConversation(conversationId);
  if (!conversation) return { error: "That room no longer exists." };

  if (!needsRequestToJoin(conversation.kind as ConversationKind)) {
    return { error: "That room isn't joined by request." };
  }
  if (!(await mayRequestToJoin(conversation, viewer.who))) {
    return { error: "That room isn't open to you." };
  }

  try {
    await dataDb.dataConversationRequest.upsert({
      where: { conversationId_participant: { conversationId, participant: viewer.key } },
      create: {
        conversationId,
        participant: viewer.key,
        displayName: viewer.name,
        message,
        status: "pending",
      },
      // Asking again after a refusal reopens the ask rather than stacking rows.
      update: { message, status: "pending", decidedAt: null },
    });
  } catch {
    return { error: "Couldn't send that request." };
  }

  revalidateChat(conversationId);
  return { ok: true, message: "Request sent." };
}

/** Admit somebody, or turn them down. Only the room's owner decides. */
export async function decideRequest(fd: FormData): Promise<void> {
  const viewer = await currentViewer();
  const id = String(fd.get("id") ?? "").trim();
  const approve = String(fd.get("decision") ?? "") === "approve";
  if (!viewer || !id) return;

  try {
    const request = await dataDb.dataConversationRequest.findUnique({
      where: { id },
      select: { conversationId: true, participant: true, displayName: true, status: true },
    });
    if (!request || request.status !== "pending") return;

    const access = await conversationAccess(request.conversationId, viewer.who);
    if (!access.ok || !(access.isOwner || access.isAdmin)) return;

    await dataDb.dataConversationRequest.update({
      where: { id },
      data: { status: approve ? "approved" : "declined", decidedAt: new Date() },
    });

    if (approve) {
      await dataDb.dataConversationMember.upsert({
        where: {
          conversationId_participant: {
            conversationId: request.conversationId,
            participant: request.participant,
          },
        },
        create: {
          conversationId: request.conversationId,
          participant: request.participant,
          displayName: request.displayName,
        },
        update: {},
      });
    }
    revalidateChat(request.conversationId);
  } catch {
    // Gone, or not migrated.
  }
}

/** Close a room. The owner, or an admin for anything the platform answers for. */
export async function closeConversation(fd: FormData): Promise<void> {
  const viewer = await currentViewer();
  const id = String(fd.get("id") ?? "").trim();
  if (!viewer || !id) return;

  const access = await conversationAccess(id, viewer.who);
  if (!access.ok || !(access.isOwner || access.isAdmin)) return;

  try {
    await dataDb.dataConversation.update({ where: { id }, data: { status: "closed" } });
  } catch {
    // Gone, or not migrated.
  }
  revalidateChat(id);
}
