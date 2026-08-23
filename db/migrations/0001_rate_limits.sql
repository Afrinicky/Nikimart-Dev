-- NikiMart catch-up migration: durable rate-limit windows.
--
-- Run this BEFORE or WITH the deploy that ships the Postgres-backed limiter.
-- Until the table exists, rateLimit() fails open — every attempt is allowed —
-- so sign-in, registration, password-reset and bundle ordering run unthrottled
-- in the gap.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS "RateLimit" (
  "key"     TEXT         NOT NULL,
  "count"   INTEGER      NOT NULL DEFAULT 1,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- The sweep deletes by resetAt; without this it is a full scan every run.
CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit" ("resetAt");
