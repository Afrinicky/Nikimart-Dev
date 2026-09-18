-- 0015 — the mall gets announcements of its own.
--
-- Deliberately its own table rather than a shared one with the bundle side.
-- The two businesses have different audiences, different people writing, and
-- separate databases; a notice to data agents about a network outage has no
-- business appearing on a shop dashboard, and one table would make that an
-- accident waiting to happen rather than an impossibility.
CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  -- info | warning | success — the accent on the notice card.
  "tone"      TEXT NOT NULL DEFAULT 'info',
  -- CUSTOMERS | VENDORS | EVERYONE.
  "audience"  TEXT NOT NULL DEFAULT 'EVERYONE',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "isPinned"  BOOLEAN NOT NULL DEFAULT false,
  "publishAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Announcement_isActive_createdAt_idx"
  ON "Announcement"("isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "Announcement_audience_isActive_idx"
  ON "Announcement"("audience", "isActive");
