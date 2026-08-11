import "server-only";

/**
 * A small fixed-window rate limiter for the endpoints worth slowing down:
 * sign-in, registration, and password-reset codes.
 *
 * State lives in the process, so on serverless each instance keeps its own
 * counters and a determined attacker spread across instances gets more attempts
 * than the nominal limit. That's still a large reduction on the unlimited
 * guessing the endpoints allowed before, and it needs no extra infrastructure.
 * Move the counters to Redis (or Postgres) if the traffic ever justifies it.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Drop expired windows so the map can't grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/**
 * Count one attempt against `key`. Returns ok:false once `limit` attempts have
 * been made inside `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { ok: existing.count <= limit, remaining: Math.max(0, limit - existing.count), retryAfter };
}

/** Forget a key — call after a success so a good login clears the counter. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** A human-friendly "try again in …" phrase for an error message. */
export function retryAfterLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
