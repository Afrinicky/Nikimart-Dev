"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";
import { audienceOptions } from "@/lib/announcement-rules";

/**
 * Writing, scheduling and retiring announcements, for both consoles.
 *
 * One file, two sets of rows. The validation is identical — a title, a body, a
 * tone, an audience and an optional window — so writing it twice would only be
 * a way for the two to drift. Which table a call touches is decided by the
 * `scope` the form carries, checked against that console's own audience list,
 * so a form cannot address an audience the console it came from does not have.
 */

export type AnnouncementState = { ok?: boolean; error?: string; message?: string };

export type Scope = "data" | "retail";

const schema = z.object({
  title: z.string().trim().min(3, "Give the announcement a title.").max(120),
  body: z.string().trim().min(5, "Write the announcement.").max(4000),
  tone: z.enum(["info", "warning", "success"]),
  audience: z.string().trim().min(1),
  isPinned: z.boolean(),
  isActive: z.boolean(),
  publishAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
});

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** A datetime-local value, or null. An unreadable one is no window at all. */
function when(fd: FormData, key: string): Date | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scopeOf(fd: FormData): Scope {
  return str(fd, "scope") === "retail" ? "retail" : "data";
}

export async function saveAnnouncement(
  _prev: AnnouncementState,
  fd: FormData,
): Promise<AnnouncementState> {
  const admin = await requireAdmin();
  const scope = scopeOf(fd);

  const parsed = schema.safeParse({
    title: str(fd, "title"),
    body: str(fd, "body"),
    tone: ["info", "warning", "success"].includes(str(fd, "tone")) ? str(fd, "tone") : "info",
    audience: str(fd, "audience"),
    isPinned: fd.get("isPinned") === "on",
    // A new notice is live unless the writer says otherwise; an edit carries
    // whatever the checkbox now says.
    isActive: fd.get("isActive") === "on",
    publishAt: when(fd, "publishAt"),
    expiresAt: when(fd, "expiresAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  // A console can only address its own people. Anything else is a form that
  // has been edited, and it is corrected rather than honoured.
  if (!audienceOptions(scope).some((a) => a.value === data.audience)) {
    return { error: "Choose who this is for." };
  }
  if (data.publishAt && data.expiresAt && data.expiresAt <= data.publishAt) {
    return { error: "It can't stop before it starts." };
  }

  const id = str(fd, "id");
  const values = {
    title: data.title,
    body: data.body,
    tone: data.tone,
    audience: data.audience,
    isPinned: data.isPinned,
    isActive: data.isActive,
    publishAt: data.publishAt,
    expiresAt: data.expiresAt,
  };

  try {
    if (scope === "retail") {
      if (id) await prisma.announcement.update({ where: { id }, data: values });
      else {
        await prisma.announcement.create({
          data: { ...values, createdBy: admin.name ?? admin.email ?? "" },
        });
      }
    } else {
      if (id) await dataDb.dataAnnouncement.update({ where: { id }, data: values });
      else {
        await dataDb.dataAnnouncement.create({
          data: { ...values, createdBy: admin.name ?? admin.email ?? "" },
        });
      }
    }
  } catch {
    return { error: "Couldn't save that. Please try again." };
  }

  revalidateFor(scope);
  return { ok: true, message: id ? "Announcement updated." : "Announcement published." };
}

export async function setAnnouncementActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const id = str(fd, "id");
  if (!id) return;
  const isActive = str(fd, "isActive") === "1";

  try {
    if (scope === "retail") await prisma.announcement.update({ where: { id }, data: { isActive } });
    else await dataDb.dataAnnouncement.update({ where: { id }, data: { isActive } });
  } catch {
    return;
  }
  revalidateFor(scope);
}

export async function setAnnouncementPinned(fd: FormData): Promise<void> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const id = str(fd, "id");
  if (!id) return;
  const isPinned = str(fd, "isPinned") === "1";

  try {
    if (scope === "retail") await prisma.announcement.update({ where: { id }, data: { isPinned } });
    else await dataDb.dataAnnouncement.update({ where: { id }, data: { isPinned } });
  } catch {
    return;
  }
  revalidateFor(scope);
}

export async function deleteAnnouncement(fd: FormData): Promise<void> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const id = str(fd, "id");
  if (!id) return;

  try {
    if (scope === "retail") await prisma.announcement.delete({ where: { id } });
    else await dataDb.dataAnnouncement.delete({ where: { id } });
  } catch {
    // Already gone.
  }
  revalidateFor(scope);
  redirect(scope === "retail" ? "/admin/announcements" : "/admin/data/announcements");
}

function revalidateFor(scope: Scope): void {
  if (scope === "retail") {
    revalidatePath("/admin/announcements");
    return;
  }
  revalidatePath("/admin/data/announcements");
  // The agent console reads these on every screen, and its notifications page
  // is where somebody goes looking when they were told there was a notice.
  revalidatePath("/agent");
  revalidatePath("/agent/notifications");
}
