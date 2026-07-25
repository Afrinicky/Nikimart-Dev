-- NikiMart — Neon catch-up SQL for affiliate management (status + per-affiliate rate).
-- Run on the production (Neon) database at/after deploy. Idempotent.
-- Requires the affiliate tables (nikimart-neon-affiliates.sql) +
-- nikimart-neon-affiliate-referrals.sql to exist.

ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;
