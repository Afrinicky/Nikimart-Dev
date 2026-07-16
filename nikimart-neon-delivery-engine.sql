-- NikiMart — Neon catch-up SQL for the "global shopping + delivery engine" batch.
-- Safe to run more than once (idempotent). Run this on the production (Neon)
-- database before deploying the matching code.
--
-- Covers:
--   • Vendor.originCountry        (global shopping / ships-from-abroad)
--   • Product.shippingWeightKg    (delivery-fee engine — billable weight)
--   • Location.deliveryZoneMultiplier (delivery-fee engine — destination zone)
--   • User.address + User.preferredPickupId (+ FK) (registration address/pickup)

-- 1. Vendor origin country ---------------------------------------------------
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "originCountry" TEXT NOT NULL DEFAULT 'GH';

-- 2. Product billable shipping weight ---------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shippingWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- 3. Location delivery zone multiplier --------------------------------------
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "deliveryZoneMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- 4. User default address + preferred pickup centre -------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredPickupId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_preferredPickupId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_preferredPickupId_fkey"
      FOREIGN KEY ("preferredPickupId") REFERENCES "PickupPoint"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Optional: seed the new delivery-fee engine settings (defaults otherwise).
INSERT INTO "SiteSetting" ("key","value") VALUES
  ('deliveryPerKg','5'),
  ('pickupFee','0')
ON CONFLICT ("key") DO NOTHING;
