-- NikiMart — Neon catch-up SQL for affiliates (Finance console).
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Adds the Affiliate and AffiliatePayout tables used by
-- Admin → Finance → Affiliates. The rest of the Finance tab (overview, seller
-- settlements/payouts) needs the commission migration
-- (nikimart-neon-commission.sql) to be applied too.

CREATE TABLE IF NOT EXISTS "Affiliate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "code" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_code_key" ON "Affiliate"("code");

CREATE TABLE IF NOT EXISTS "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL DEFAULT '',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "affiliateId" TEXT NOT NULL,
    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliatePayout_affiliateId_fkey') THEN
    ALTER TABLE "AffiliatePayout"
      ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
