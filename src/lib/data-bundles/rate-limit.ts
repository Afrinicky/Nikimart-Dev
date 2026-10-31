import "server-only";
import { dataDb } from "@/lib/data-db";

/**
 * Rate limiting for the bundle business, counted in the bundle database.
 *
 * The same shape as src/lib/rate-limit.ts and the same judgement at the end —
 * an unreachable database allows the attempt, because every caller is about to
 * do database work of its own and refusing here would turn an outage into a
 * lockout. What is different is only which database it counts in, and that is
 * the point: the mall being down must not leave the agent sign-in unthrottled.
 */

export interface DataRateLimitResult {
  ok: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

interface Row {
  count: number;
  resetAt: Date;
}

export async function dataRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<DataRateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  let row: Row | undefined;
  try {
    // One statement does all of it: insert the first attempt, increment an
    // open window, or start a fresh window over an expired one.
    const rows = await dataDb.$queryRaw<Row[]>`
      INSERT INTO "DataRateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "DataRateLimit"."resetAt" <= NOW() THEN 1 ELSE "DataRateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "DataRateLimit"."resetAt" <= NOW() THEN ${resetAt} ELSE "DataRateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `;
    row = rows[0];
  } catch {
    // Table not migrated yet, or the database is unreachable.
    return { ok: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  if (!row) {
    return { ok: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  const retryAfter = Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000));
  return {
    ok: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfter,
  };
}

/** Forget a key — called after a success, so a good sign-in clears it. */
export async function clearDataRateLimit(key: string): Promise<void> {
  try {
    await dataDb.dataRateLimit.delete({ where: { key } });
  } catch {
    // Already gone, or not migrated. Either way there is nothing to clear.
  }
}

/** Drop windows that have already ended, for the cron. */
export async function sweepDataRateLimits(): Promise<number> {
  try {
    const { count } = await dataDb.dataRateLimit.deleteMany({
      where: { resetAt: { lt: new Date() } },
    });
    return count;
  } catch {
    return 0;
  }
}
