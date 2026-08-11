-- NikiMart — Neon catch-up SQL: per-product affiliate program + shop branding.
-- Run on the production (Neon) database at/after deploy. Idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "affiliateCommission" DOUBLE PRECISION;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT NOT NULL DEFAULT '';
