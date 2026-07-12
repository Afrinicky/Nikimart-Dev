-- NikiMart — Phase 6 page-builder tables (incremental, additive, safe to re-run).
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
