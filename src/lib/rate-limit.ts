import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A fixed-window rate limiter for the endpoints worth slowing down: sign-in,
 * registration, password-reset codes, bundle orders, agent applications and
 * withdrawals.
 *
 * The counters live in Postgres, not in the process. That matters because the
 * app runs serverless: a process-local Map is per-instance, so a nominal "8
 * attempts per 10 minutes" is really "8 per warm lambda", and traffic spread
 * across instances gets as many multiples as the platform cares to start. The
 * limit these numbers describe is only the real limit if every instance counts
 * against the same row.
 *
 * The whole check is one statement. Reading a count and then writing it back
 * would let two simultaneous attempts both read "7 so far" and both proceed —
 * exactly the burst the limit exists to stop.
 */

export interface RateLimitResult {
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

/**
 * Count one attempt against `key`. Returns ok:false once `limit` attempts have
 * been made inside `windowMs`.
 *
 * If the database can't be reached this allows the attempt. Every caller is
 * about to do database work of its own and will fail on its own terms a moment
 * later, so refusing here would turn an outage into a lockout without keeping
 * anyone out who wasn't already blocked.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  let row: Row | undefined;
  try {
    // One statement does all of it: insert the first attempt, increment an
    // open window, or start a fresh window over an expired one. `resetAt` is
    // compared against the row's own value so a lapsed window rolls over
    // rather than staying refused forever.
    const rows = await prisma.$queryRaw<Row[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
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

/** Forget a key — call after a success so a good login clears the counter. */
export async function clearRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.delete({ where: { key } });
  } catch {
    // Already gone, or not migrated. Either way there's nothing to clear.
  }
}

/**
 * Drop windows that have already ended. Called from the cron so the table
 * stays roughly the size of current traffic rather than growing forever.
 */
export async function sweepRateLimits(): Promise<number> {
  try {
    const { count } = await prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: new Date() } },
    });
    return count;
  } catch {
    return 0;
  }
}

/** A human-friendly "try again in …" phrase for an error message. */
export function retryAfterLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
