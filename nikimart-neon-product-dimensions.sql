-- NikiMart — Neon catch-up SQL for size-based delivery pricing.
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Adds parcel dimensions to products so delivery can be charged by size
-- (volumetric weight) as well as by actual weight. Configure the basis in
-- Admin -> Settings -> Delivery fees.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lengthCm" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "widthCm" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "heightCm" DOUBLE PRECISION NOT NULL DEFAULT 0;
