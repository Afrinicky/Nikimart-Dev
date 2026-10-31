-- 0024 — rate limiting that does not need the mall.
--
-- The companion to 0023: once agents sign in against this database, the
-- throttle on guessing their passwords has to live here too. Counting against
-- the mall's RateLimit table would have meant that a retail outage left the
-- agent sign-in with no brute-force protection at all — at precisely the
-- moment somebody is most likely to be trying it, and when nobody watching
-- the mall would see it happening.
--
-- The window is one statement in rate-limit.ts, for the same reason as the
-- mall's: reading a count and writing it back lets two simultaneous attempts
-- both read "7 so far" and both proceed.

CREATE TABLE IF NOT EXISTS "DataRateLimit" (
  "key"     TEXT NOT NULL,
  "count"   INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRateLimit_pkey" PRIMARY KEY ("key")
);

-- The sweep in the cron deletes by resetAt, so it gets an index rather than a
-- full scan of a table the size of current traffic.
CREATE INDEX IF NOT EXISTS "DataRateLimit_resetAt_idx" ON "DataRateLimit"("resetAt");
