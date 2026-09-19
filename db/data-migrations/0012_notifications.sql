-- Things that happened, kept rather than counted.
--
-- The console could already tell you how many withdrawals were pending and how
-- many applications were waiting, but only while they still were: a request
-- raised and paid the same afternoon left nothing behind saying anybody had
-- ever been asked. A count is a state, and states forget.
--
-- A notification is the record. It is written where the thing happened, links
-- back to it, and is marked read by the person who dealt with it — so the bell
-- on the overview is a queue of work rather than a badge that clears itself
-- when the underlying count drops.

CREATE TABLE IF NOT EXISTS "DataNotification" (
  "id"        TEXT NOT NULL,
  -- WITHDRAWAL | APPLICATION | REGISTRATION | SUPPORT | SYSTEM
  "kind"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL DEFAULT '',
  -- Where in the console it leads. Empty for a notice with nothing to open.
  "href"      TEXT NOT NULL DEFAULT '',
  -- info | success | warning | danger
  "tone"      TEXT NOT NULL DEFAULT 'info',
  -- Unique to the thing being announced, so one event is recorded once however
  -- many callers get as far as writing it.
  "dedupeKey" TEXT,
  -- Null while it still wants attention.
  "readAt"    TIMESTAMP(3),
  "readBy"    TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataNotification_dedupeKey_key"
  ON "DataNotification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DataNotification_readAt_createdAt_idx"
  ON "DataNotification"("readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "DataNotification_kind_createdAt_idx"
  ON "DataNotification"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "DataNotification_createdAt_idx"
  ON "DataNotification"("createdAt");
