"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { memberLevelFor } from "@/lib/data-bundles/team/hierarchy";

/**
 * What a leader writes: posts to their team, notes about one member.
 *
 * Every action re-reads the leader from the signed-in user rather than
 * trusting an id from the browser, and a note about somebody is refused unless
 * they are actually in that leader's team — so neither can become a way to
 * write into somebody else's downline.
 */

export type TeamActionState = { ok?: boolean; error?: string; message?: string };

const postSchema = z.object({
  title: z.string().trim().min(3, "Give it a title.").max(80),
  body: z.string().trim().min(5, "Say something.").max(2000),
});

/** Post to your own team. */
export async function postToTeam(
  _prev: TeamActionState,
  fd: FormData,
): Promise<TeamActionState> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { error: "You don't have an agent account." };

  const parsed = postSchema.safeParse({ title: fd.get("title"), body: fd.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const limit = await rateLimit(`team-post:${agent.id}`, 20, 60 * 60_000);
  if (!limit.ok) {
    return { error: `You've posted a lot today. Try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  try {
    await dataDb.dataTeamPost.create({
      data: {
        leaderId: agent.id,
        title: parsed.data.title,
        body: parsed.data.body,
        isPinned: fd.get("isPinned") === "on",
      },
    });
  } catch {
    return { error: "Couldn't post that. Please try again." };
  }

  revalidatePath("/agent/team");
  return { ok: true, message: "Posted to your team." };
}

/** Take one down. Only the leader who wrote it can. */
export async function deleteTeamPost(fd: FormData): Promise<void> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  const id = String(fd.get("id") ?? "").trim();
  if (!agent || !id) return;

  try {
    // Scoped to the author in the delete itself, so an id from elsewhere
    // matches nothing rather than being checked and then trusted.
    await dataDb.dataTeamPost.deleteMany({ where: { id, leaderId: agent.id } });
  } catch {
    // Gone, or not migrated.
  }
  revalidatePath("/agent/team");
}

const noteSchema = z.object({
  memberId: z.string().trim().min(1),
  body: z.string().trim().min(2, "Write the note.").max(1000),
});

/** Keep a private note about one of your members. */
export async function addMemberNote(
  _prev: TeamActionState,
  fd: FormData,
): Promise<TeamActionState> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { error: "You don't have an agent account." };

  const parsed = noteSchema.safeParse({ memberId: fd.get("memberId"), body: fd.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  // The permission check: their own two levels, and nobody else's.
  if (!(await memberLevelFor(agent.id, parsed.data.memberId))) {
    return { error: "That agent isn't in your team." };
  }

  try {
    await dataDb.dataTeamNote.create({
      data: { leaderId: agent.id, memberId: parsed.data.memberId, body: parsed.data.body },
    });
  } catch {
    return { error: "Couldn't save that note. Please try again." };
  }

  revalidatePath(`/agent/team/${parsed.data.memberId}`);
  return { ok: true, message: "Note saved." };
}

/** Remove a note. Only its author can. */
export async function deleteMemberNote(fd: FormData): Promise<void> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  const id = String(fd.get("id") ?? "").trim();
  const memberId = String(fd.get("memberId") ?? "").trim();
  if (!agent || !id) return;

  try {
    await dataDb.dataTeamNote.deleteMany({ where: { id, leaderId: agent.id } });
  } catch {
    // Gone, or not migrated.
  }
  if (memberId) revalidatePath(`/agent/team/${memberId}`);
}
