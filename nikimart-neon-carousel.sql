-- NikiMart — Neon catch-up SQL for the homepage carousel + configurable logo.
-- Run this on the production (Neon) database before/at deploy.
-- Safe to run more than once (idempotent).
--
-- The storefront degrades gracefully without this (the carousel falls back to
-- built-in default slides and the logo uses the bundled /logo.png), but the
-- admin "Carousel" manager needs the Banner table to exist. Creating a banner
-- in the admin will fail with a server error until this table is present.

-- 1) Homepage promotional carousel slides (admin-editable).
CREATE TABLE IF NOT EXISTS "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "eventWindow" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT 'Shop now',
    "ctaHref" TEXT NOT NULL DEFAULT '/products',
    "image" TEXT,
    "accentFrom" TEXT NOT NULL DEFAULT '#ff7a1a',
    "accentTo" TEXT NOT NULL DEFAULT '#0e1f36',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- 2) Seed the built-in default carousels as real, editable rows — but ONLY when
--    the table is still empty, so re-running this never duplicates them and
--    never overwrites banners you've already created/edited in the admin.
INSERT INTO "Banner" ("id","title","subtitle","eventWindow","ctaLabel","ctaHref","image","accentFrom","accentTo","isActive","order")
SELECT * FROM (VALUES
  ('seed_banner_1','Shop local, preorder global','Trusted local shops, campus vendors, and services — all in one place.','','Shop now','/products',NULL::text,'#ff7a1a','#0e1f36',true,0),
  ('seed_banner_2','Buy data bundles','MTN, Telecel & AirtelTigo data at great rates.','ALL NETWORKS','Buy data','https://www.4ubundles.store/store/Nickland',NULL::text,'#1f7a4d','#0e1f36',true,1),
  ('seed_banner_3','Flash Sales are live','Grab limited-time deals before they''re gone.','TODAY ONLY','See deals','/products?badge=flash_sale',NULL::text,'#ef4444','#7a1030',true,2),
  ('seed_banner_4','Shop the world, pick up in Ghana','Buy from trusted sellers abroad — we handle freight, customs, and delivery.','','Global shopping','/global-shopping',NULL::text,'#0ea5e9','#0e1f36',true,3)
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM "Banner");

-- 3) Configurable brand logo. Stored as a SiteSetting row (empty = bundled
--    logo), so no schema change is needed — this just makes the default
--    explicit.
INSERT INTO "SiteSetting" ("key","value") VALUES ('logoUrl','')
ON CONFLICT ("key") DO NOTHING;

-- 4) Data-bundles storefront URL used by the sidebar/footer shortcuts. Edit the
--    value to point at your storefront (you can also change it any time in
--    Admin → Settings → Contact & support).
INSERT INTO "SiteSetting" ("key","value") VALUES ('dataBundlesUrl','https://www.4ubundles.store/store/Nickland')
ON CONFLICT ("key") DO NOTHING;
