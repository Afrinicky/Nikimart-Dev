-- NikiMart — Neon catch-up SQL for the product-level affiliate programme.
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Adds:
--   * Category.affiliateCommissionRate  — admin default affiliate % per category
--   * Product.affiliateEnabled          — is the product offered to affiliates?
--   * Product.affiliateEnrolledBy       — 'seller' | 'admin' | '' (who funds it)
--   * Product.affiliateCommissionRate   — per-product affiliate % override
--   * Product.isArchived                — soft-delete for products with sales
--   * OrderItem affiliate snapshot columns (rate, amount, who funded it)
-- Plus the affiliate programme settings used by the storefront copy.

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "affiliateCommissionRate" DOUBLE PRECISION;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "affiliateEnrolledBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "affiliateCommissionRate" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "affiliateCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "affiliateCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "affiliateFundedBy" TEXT NOT NULL DEFAULT '';

-- Programme settings. `affiliateRate` is the default commission used when a
-- product and its category have no override; `affiliateMaxRate` drives the
-- "earn up to X%" headline; `affiliatePitch` is the headline itself ({rate} is
-- replaced with the max rate). All three are editable in Admin → Settings.
INSERT INTO "SiteSetting" ("key","value") VALUES ('affiliateRate','5')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "SiteSetting" ("key","value") VALUES ('affiliateMaxRate','10')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "SiteSetting" ("key","value")
VALUES ('affiliatePitch','You can earn up to {rate}% on each product you refer.')
ON CONFLICT ("key") DO NOTHING;

-- Record the migration as applied, so a later `prisma migrate deploy` skips it
-- instead of re-running its plain ADD COLUMN statements and failing on columns
-- that already exist. Skipped entirely if the database has no Prisma migration
-- history (i.e. the schema was only ever created from these SQL files).
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "_prisma_migrations"
       WHERE "migration_name" = '20260810120000_affiliate_product_enrolment'
     )
  THEN
    INSERT INTO "_prisma_migrations"
      ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
    VALUES (
      gen_random_uuid()::text,
      '592392049afd63993a0dcfe04db38e5ca9c8f1826cda9d27e47e4ff3ff8e7dd6',
      now(),
      '20260810120000_affiliate_product_enrolment',
      now(),
      1
    );
  END IF;
END $$;
