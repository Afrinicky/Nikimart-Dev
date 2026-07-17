-- NikiMart — Phase 8: product images + attributes (incremental, additive, safe).
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
