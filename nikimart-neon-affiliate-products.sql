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
