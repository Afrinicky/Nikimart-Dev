-- NikiMart — Neon catch-up SQL for platform commission + seller payouts.
-- Run this on the production (Neon) database at/after deploy.
-- Safe to run more than once (idempotent).
--
-- Adds:
--   * Category.commissionRate     — optional per-category commission override (%)
--   * OrderItem.commissionRate     — commission % snapshotted at sale time
--   * Payout table                 — seller settlement records (paid in Finance)
-- Plus the default platform commission rate setting (10%).

-- 1) Per-category commission override (NULL = use platform default).
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;

-- 2) Commission snapshot on each order item (existing rows default to 0%).
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 3) Seller payouts.
CREATE TABLE IF NOT EXISTS "Payout" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL DEFAULT '',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "vendorId" TEXT NOT NULL,
    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Payout_vendorId_idx" ON "Payout"("vendorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payout_vendorId_fkey'
  ) THEN
    ALTER TABLE "Payout"
      ADD CONSTRAINT "Payout_vendorId_fkey"
      FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) Default platform commission rate (percent). Change it any time in
--    Admin → Settings, or override per category in Admin → Categories.
INSERT INTO "SiteSetting" ("key","value") VALUES ('commissionRate','10')
ON CONFLICT ("key") DO NOTHING;
