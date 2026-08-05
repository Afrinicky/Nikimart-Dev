-- NikiMart — Neon catch-up SQL for CBM pickup-only shipping.
-- Adds: Product.cbm, Vendor.originPickupId (seller's origin/consolidation hub),
-- and the ShippingRate table (per-route ₵/CBM rates between pickup points).
-- Run on the production (Neon) database at/after deploy. Idempotent.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "cbm" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "originPickupId" TEXT;

CREATE TABLE IF NOT EXISTS "ShippingRate" (
    "id" TEXT NOT NULL,
    "originHubId" TEXT NOT NULL,
    "destPickupId" TEXT NOT NULL,
    "ratePerCbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShippingRate_destPickupId_idx" ON "ShippingRate"("destPickupId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingRate_originHubId_destPickupId_key" ON "ShippingRate"("originHubId", "destPickupId");

-- Foreign keys (guarded so re-runs don't error).
DO $$ BEGIN
  ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_originPickupId_fkey"
    FOREIGN KEY ("originPickupId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_originHubId_fkey"
    FOREIGN KEY ("originHubId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_destPickupId_fkey"
    FOREIGN KEY ("destPickupId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
