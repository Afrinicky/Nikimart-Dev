import "server-only";
import { dataDb } from "@/lib/data-db";
import { announcementStatus, isShowable, reaches } from "@/lib/announcement-rules";

/**
 * Reads for the bundle side's announcements.
 *
 * The console wants every notice ever written, filterable; a reader wants only
 * the handful aimed at them that are live right now. Both come from here, so
 * "Live" on the admin's screen and "shown" on an agent's can never mean two
 * different things.
 */

export interface AnnouncementListOptions {
  status?: string;
  audience?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export async function listAnnouncements(opts: AnnouncementListOptions = {}) {
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
    // Status is a window against the clock rather than a column, so it cannot
    // be filtered in SQL without duplicating the rule — and duplicating it is
    // exactly how the two screens would come to disagree. The status filter is
    // applied after the read; the rest narrows in the database.
    const all = await dataDb.dataAnnouncement.findMany({
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

export async function getAnnouncement(id: string) {
  return dataDb.dataAnnouncement.findUnique({ where: { id } }).catch(() => null);
}

/**
 * The notices one kind of reader should see right now.
 *
 * Every condition is applied here rather than by the caller: a screen that
 * forgets one shows a notice that expired last week, or one addressed to
 * somebody else.
 */
export async function announcementsFor(reader: "AGENTS" | "CUSTOMERS", take = 30) {
  try {
    const rows = await dataDb.dataAnnouncement.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.filter((n) => isShowable(n) && reaches(n.audience, reader)).slice(0, take);
  } catch {
    return [];
  }
}
