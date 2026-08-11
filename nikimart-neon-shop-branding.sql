-- NikiMart — Neon catch-up SQL: shop branding (logo, banner, WhatsApp).
-- Run on the production (Neon) database at/after deploy. Idempotent.
-- (Affiliate program columns live in nikimart-neon-affiliate-products.sql.)
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT NOT NULL DEFAULT '';
