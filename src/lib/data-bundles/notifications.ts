import "server-only";
import { dataDb } from "@/lib/data-db";
import type { NotificationKind } from "@/lib/data-bundles/notification-rules";

/**
 * The console's own record of things that happened.
 *
 * Every screen here already counts something — withdrawals pending, orders
 * failed, applications waiting. Counts are the right thing for "what is
 * outstanding" and the wrong thing for "what happened": a request raised and
 * paid inside an afternoon leaves nothing behind saying anybody was ever
 * asked, and an admin who was away that afternoon has no way to find out.
 *
 * So the events that want a person are written down as they happen, with a
 * link back to the thing itself, and marked read by whoever dealt with them.
 * The bell is then a queue of work rather than a badge that empties itself
 * when the underlying count happens to drop.
 *
 * Writing one is best-effort, always. A notification is a side effect of
 * something that has already been saved, and failing to announce it must never
 * undo it.
 */

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Where in the console it leads. Omit for a notice with nothing to open. */
  href?: string;
  tone?: "info" | "success" | "warning" | "danger";
  /**
   * Unique to the thing being announced, e.g. "WITHDRAWAL:<id>". A second
   * write with the same key is refused by the database rather than duplicated,
   * so a path retried by a webhook, a redirect or an admin records one notice.
   */
  dedupeKey?: string;
}

/** Write one down. Never throws, and never blocks the thing it is announcing. */
export async function recordNotification(input: NewNotification): Promise<void> {
  try {
    await dataDb.dataNotification.create({
      data: {
        kind: input.kind,
        title: input.title,
        body: input.body ?? "",
        href: input.href ?? "",
        tone: input.tone ?? "info",
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch {
    // Already recorded, or the table isn't migrated yet. Either way the thing
    // it describes is safely saved, which is what mattered.
  }
}

export interface NotificationListOptions {
  kind?: string;
  read?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

/** The full history, for the Notifications tab. */
export async function listNotifications(opts: NotificationListOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;
  const term = (opts.query ?? "").trim();

  const where = {
    ...(opts.kind && opts.kind !== "all" ? { kind: opts.kind } : {}),
    ...(opts.read === "unread" ? { readAt: null } : {}),
    ...(opts.read === "read" ? { readAt: { not: null } } : {}),
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
    const [rows, total, unread] = await Promise.all([
      dataDb.dataNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      dataDb.dataNotification.count({ where }),
      dataDb.dataNotification.count({ where: { readAt: null } }),
    ]);
    return { rows, total, unread };
  } catch {
    return { rows: [], total: 0, unread: 0 };
  }
}

export interface BellState {
  unread: number;
  rows: {
    id: string;
    kind: string;
    title: string;
    body: string;
    href: string;
    tone: string;
    readAt: Date | null;
    createdAt: Date;
  }[];
}

/**
 * What the bell shows: the unread count, and the handful behind it.
 *
 * Deliberately the latest few rather than the latest few *unread*. A bell that
 * empties to nothing the moment you read it is a bell you cannot check twice,
 * and "what came in this morning" is a question people ask after they have
 * already dealt with it.
 */
export async function getBellState(take = 6): Promise<BellState> {
  try {
    const [rows, unread] = await Promise.all([
      dataDb.dataNotification.findMany({ orderBy: { createdAt: "desc" }, take }),
      dataDb.dataNotification.count({ where: { readAt: null } }),
    ]);
    return { unread, rows };
  } catch {
    return { unread: 0, rows: [] };
  }
}

export async function unreadNotificationCount(): Promise<number> {
  try {
    return await dataDb.dataNotification.count({ where: { readAt: null } });
  } catch {
    return 0;
  }
}
