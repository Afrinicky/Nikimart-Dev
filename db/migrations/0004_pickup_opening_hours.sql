-- Collection hours for a pickup point.
--
-- The public /pickup-points page listed nine hardcoded points from
-- lib/global-data while the admin console managed a completely separate
-- PickupPoint table, so nothing an admin changed ever appeared on the site.
-- Wiring the page to the table needs somewhere to keep the opening hours the
-- page shows; everything else it needs (name, location, address) is already
-- there. Blank falls back to the site-wide businessHours setting, so existing
-- rows read sensibly without a backfill.
ALTER TABLE "PickupPoint" ADD COLUMN IF NOT EXISTS "openingHours" TEXT NOT NULL DEFAULT '';
