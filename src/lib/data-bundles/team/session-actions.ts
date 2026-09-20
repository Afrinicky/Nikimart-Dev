"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { sessionAccess } from "@/lib/data-bundles/team/sessions";

/**
 * Holding a session: scheduling one, opening it, being counted at it, and
 * closing it with a record of what was said.
 *
 * Only the host opens and closes. Attendance is the attendee's own write and
 * happens once on arrival — not per heartbeat, because a leader wants to know
 * who came rather than a second-by-second log of who had the tab open.
 */

export type SessionState = { ok?: boolean; error?: string; message?: string };

const scheduleSchema = z.object({
  title: z.string().trim().min(3, "Give the session a title.").max(80),
  agenda: z.string().trim().max(1000).optional(),
  startsAt: z.string().trim().min(1, "When does it start?"),
});

/** Put a session in the diary. */
export async function scheduleSession(
  _prev: SessionState,
  fd: FormData,
): Promise<SessionState> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { error: "You don't have an agent account." };

  const parsed = scheduleSchema.safeParse({
    title: fd.get("title"),
    agenda: fd.get("agenda") ?? "",
    startsAt: fd.get("startsAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { error: "That start time isn't a date." };

  const limit = await rateLimit(`team-session:${agent.id}`, 20, 24 * 60 * 60_000);
  if (!limit.ok) {
    return { error: `You've scheduled a lot today. Try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  try {
    await dataDb.dataTeamSession.create({
      data: {
        leaderId: agent.id,
        title: parsed.data.title,
        agenda: parsed.data.agenda ?? "",
        startsAt,
      },
    });
  } catch {
    return { error: "Couldn't schedule that. Please try again." };
  }

  revalidatePath("/agent/team/sessions");
  return { ok: true, message: "Session scheduled." };
}

/** Open the room. Only the host can, and only once. */
export async function openSession(fd: FormData): Promise<void> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  const id = String(fd.get("id") ?? "").trim();
  if (!agent || !id) return;

  try {
    // Scoped to the host and to a session not already open, so two taps on a
    // slow connection cannot re-open one that has ended.
    await dataDb.dataTeamSession.updateMany({
      where: { id, leaderId: agent.id, status: "scheduled" },
      data: { status: "live", openedAt: new Date() },
    });
  } catch {
    // Gone, or not migrated.
  }
  revalidatePath("/agent/team/sessions");
  revalidatePath(`/agent/team/sessions/${id}`);
}

const transcriptSchema = z.object({
  id: z.string().trim().min(1),
  messages: z
    .array(
      z.object({
        agentId: z.string().trim().max(60).nullable().optional(),
        authorName: z.string().trim().max(80),
        body: z.string().trim().min(1).max(2000),
        saidAt: z.string().trim().min(1),
      }),
    )
    .max(500),
});

/**
 * Close the room and keep what was said.
 *
 * The transcript arrives in one batch from the host's own browser rather than
 * a row written per message as it was typed. That is the whole arrangement:
 * the realtime service carries the conversation, and the database only ever
 * sees the record of it, once.
 */
export async function endSession(
  _prev: SessionState,
  fd: FormData,
): Promise<SessionState> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { error: "You don't have an agent account." };

  let payload: unknown = { id: fd.get("id"), messages: [] };
  const raw = String(fd.get("transcript") ?? "").trim();
  if (raw) {
    try {
      payload = { id: fd.get("id"), messages: JSON.parse(raw) };
    } catch {
      // A transcript we cannot read must not stop the session being closed.
      payload = { id: fd.get("id"), messages: [] };
    }
  }

  const parsed = transcriptSchema.safeParse(payload);
  if (!parsed.success) return { error: "Couldn't close that session." };

  try {
    const claimed = await dataDb.dataTeamSession.updateMany({
      where: { id: parsed.data.id, leaderId: agent.id, status: { not: "ended" } },
      data: { status: "ended", endedAt: new Date() },
    });
    if (claimed.count === 0) return { error: "That session is already closed." };

    const lines = parsed.data.messages
      .map((m) => ({
        sessionId: parsed.data.id,
        agentId: m.agentId || null,
        authorName: m.authorName || "Someone",
        body: m.body,
        saidAt: new Date(m.saidAt),
      }))
      .filter((m) => !Number.isNaN(m.saidAt.getTime()));

    if (lines.length > 0) {
      await dataDb.dataTeamSessionMessage.createMany({ data: lines });
    }
  } catch {
    return { error: "Couldn't close that session. Please try again." };
  }

  revalidatePath("/agent/team/sessions");
  revalidatePath(`/agent/team/sessions/${parsed.data.id}`);
  return { ok: true, message: "Session closed and saved." };
}

/**
 * Record that somebody turned up.
 *
 * Idempotent: joining twice, or rejoining after a dropped connection, is one
 * attendance rather than two.
 */
export async function markAttendance(sessionId: string): Promise<void> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent || !sessionId) return;

  const access = await sessionAccess(sessionId, agent.id);
  if (!access.ok) return;

  try {
    await dataDb.dataTeamSessionAttendee.upsert({
      where: { sessionId_agentId: { sessionId, agentId: agent.id } },
      create: { sessionId, agentId: agent.id, lastSeen: new Date() },
      update: { lastSeen: new Date() },
    });
  } catch {
    // Not migrated, or the session went away mid-join.
  }
}

/** Who the signed-in agent is, for the name on their messages. */
export async function chatIdentity(): Promise<{ agentId: string; name: string } | null> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return null;
  const owner = await getAgentUser(agent.userId);
  return { agentId: agent.id, name: owner?.name || agent.storeName };
}
