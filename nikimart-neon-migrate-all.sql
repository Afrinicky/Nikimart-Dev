-- NikiMart — catch-up migration: brings an existing Neon database up to
-- date with the current code (page builder, product images + attributes,
-- FAQs, locations, order-tracking hold flag). Every statement is guarded,
-- so this is safe to run once even if you've already applied some parts.

-- ============================================================
-- nikimart-neon-pagebuilder.sql
-- ============================================================
-- Run this ONCE in your Neon SQL Editor if you already applied the earlier
-- nikimart-neon-setup.sql. It only ADDS new tables — it does not touch your
-- existing data.
BEGIN;

CREATE TABLE IF NOT EXISTS "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PageSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Page_slug_key" ON "Page"("slug");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PageSection_pageId_fkey'
  ) THEN
    ALTER TABLE "PageSection"
      ADD CONSTRAINT "PageSection_pageId_fkey"
      FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Record the migration so Prisma considers it applied.
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,
       '1429f0dd86754159415f88a91cac91fc1df87bb49edd9c5b685bc9b597be786e',
       now(), '20260711235008_page_builder', now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260711235008_page_builder'
);

COMMIT;

-- ============================================================
-- nikimart-neon-product-images.sql
-- ============================================================
-- Run this ONCE in your Neon SQL Editor. It ADDS a column + table and backfills
-- existing products' primary image from their bundled photo. Non-destructive.
BEGIN;

-- Key attributes column (spec table).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "attributes" TEXT NOT NULL DEFAULT '[]';

-- Product gallery images.
CREATE TABLE IF NOT EXISTS "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ProductImage_productId_fkey'
  ) THEN
    ALTER TABLE "ProductImage"
      ADD CONSTRAINT "ProductImage_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Give existing products an editable primary image from their bundled photo,
-- so photos keep showing but can now be replaced or deleted in the admin/seller UI.
UPDATE "Product" SET "image" = '/products/' || "slug" || '.jpg'
WHERE "image" IS NULL OR "image" = '';

-- Record the migration so Prisma considers it applied.
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,
       '150ff749889bb7322e4c2036e4c34af9db31046d5da3138ddcc3e8d9a6f4e84a',
       now(), '20260712142729_product_images_attributes', now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260712142729_product_images_attributes'
);

COMMIT;

-- ============================================================
-- nikimart-neon-settings.sql
-- ============================================================
-- Run ONCE in your Neon SQL Editor. Adds two tables and seeds default
-- locations + FAQs so you can edit them in the admin. Non-destructive.
BEGIN;
CREATE TABLE IF NOT EXISTS "Faq" ("id" TEXT PRIMARY KEY, "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS "Location" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'city', "region" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "order" INTEGER NOT NULL DEFAULT 0);

INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('any', 'Any Location', 'city', 'Nationwide', TRUE, 0) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ug', 'University of Ghana', 'campus', 'Greater Accra', TRUE, 1) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('knust', 'KNUST', 'campus', 'Ashanti', TRUE, 2) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ucc', 'UCC', 'campus', 'Central', TRUE, 3) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('upsa', 'UPSA', 'campus', 'Greater Accra', TRUE, 4) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('stu', 'Sunyani Technical University', 'campus', 'Bono', TRUE, 5) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ntc', 'Nursing Training College', 'institution', 'Bono', TRUE, 6) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ttc', 'Teacher Training College', 'institution', 'Bono', TRUE, 7) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('st-elizabeth', 'St. Elizabeth Hospital Community', 'community', 'Ahafo', TRUE, 8) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('hwidiem', 'Hwidiem', 'town', 'Ahafo', TRUE, 9) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('goaso', 'Goaso', 'town', 'Ahafo', TRUE, 10) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('sunyani', 'Sunyani', 'city', 'Bono', TRUE, 11) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('kumasi', 'Kumasi', 'city', 'Ashanti', TRUE, 12) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('accra', 'Accra', 'city', 'Greater Accra', TRUE, 13) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-delivery', 'How does delivery and pickup work?', 'Many sellers offer same-day delivery, campus drop-off, or in-person pickup. The available options are shown on each product page and at checkout.', 0) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-preorder', 'How do preorders work?', 'Preorder items are imported on order. You pay a deposit to reserve your item, then settle the balance on arrival before delivery or pickup.', 1) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-pay', 'How do I pay?', 'NikiMart supports local payments including Mobile Money and card. You choose your payment method at checkout.', 2) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-sell', 'How do I become a seller?', 'Register your shop from “Sell on NikiMart”, complete quick verification, and start listing products.', 3) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-protection', 'Is my purchase protected?', 'Yes. Orders are covered by NikiMart Buyer Protection.', 4) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text, 'c8a149d9bc9fd8ed6b429262beff6739d41243e17379b3c38a48dbaa4f7d1e2b', now(), '20260712144801_faqs_locations', now(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260712144801_faqs_locations');
COMMIT;

-- ============================================================
-- nikimart-neon-tracking.sql
-- ============================================================
-- Run ONCE in your Neon SQL Editor. Adds one column used to pin manually-set
-- shipment statuses so automatic progression leaves them alone. Non-destructive.
BEGIN;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "manualHold" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,
       '76fa8103b605b0c024b046544a704e5c77a6d189602be1f5089017d3826ee5b3',
       now(), '20260712150346_shipment_manual_hold', now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" LIKE '%shipment_manual_hold'
);

COMMIT;

