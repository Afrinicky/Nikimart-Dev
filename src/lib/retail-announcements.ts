import "server-only";
import { prisma } from "@/lib/prisma";
import { announcementStatus, isShowable, reaches } from "@/lib/announcement-rules";

/**
 * Reads for the mall's announcements.
 *
 * The same shape as the bundle side's and deliberately not the same rows: two
 * businesses, two databases, two sets of people to talk to. Nothing here can
 * see a bundle notice and nothing there can see one of these.
 */

export interface RetailAnnouncementOptions {
  status?: string;
  audience?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export async function listRetailAnnouncements(opts: RetailAnnouncementOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const term = (opts.query ?? "").trim();

  const where = {
    ...(opts.audience && opts.audience !== "all" ? { audience: opts.audience } : {}),
    ...(term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" as const } },
            { body: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const all = await prisma.announcement.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    const filtered =
      opts.status && opts.status !== "all"
        ? all.filter((n) => announcementStatus(n) === opts.status)
        : all;

    return {
      rows: filtered.slice((page - 1) * perPage, page * perPage),
      total: filtered.length,
      counts: {
        live: all.filter((n) => announcementStatus(n) === "live").length,
        scheduled: all.filter((n) => announcementStatus(n) === "scheduled").length,
        expired: all.filter((n) => announcementStatus(n) === "expired").length,
        hidden: all.filter((n) => announcementStatus(n) === "hidden").length,
      },
    };
  } catch {
    return { rows: [], total: 0, counts: { live: 0, scheduled: 0, expired: 0, hidden: 0 } };
  }
}

export async function getRetailAnnouncement(id: string) {
  return prisma.announcement.findUnique({ where: { id } }).catch(() => null);
}

/** The notices one kind of reader should see right now. */
export async function retailAnnouncementsFor(reader: "CUSTOMERS" | "VENDORS", take = 30) {
  try {
    const rows = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.filter((n) => isShowable(n) && reaches(n.audience, reader)).slice(0, take);
  } catch {
    return [];
  }
}
