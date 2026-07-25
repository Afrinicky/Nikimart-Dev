-- NikiMart — Neon catch-up SQL for seller payout details.
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Lets sellers save Mobile Money / bank details and request payouts.

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "payoutMethod" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "momoNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "momoName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT NOT NULL DEFAULT '';
