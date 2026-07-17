-- NikiMart — Neon catch-up SQL for the homepage carousel + configurable logo.
-- Run this on the production (Neon) database before/at deploy.
-- Safe to run more than once (idempotent).
--
-- The storefront degrades gracefully without this (the carousel falls back to
-- built-in default slides and the logo uses the bundled /logo.png), but the
-- admin "Carousel" manager needs the Banner table to exist.

-- Homepage promotional carousel slides (admin-editable).
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

-- Configurable brand logo. Stored as a SiteSetting row (empty = bundled logo),
-- so no schema change is needed — this line just makes the default explicit.
INSERT INTO "SiteSetting" ("key","value") VALUES ('logoUrl','')
ON CONFLICT ("key") DO NOTHING;
