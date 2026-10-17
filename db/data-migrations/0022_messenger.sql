-- 0022 — the bundle console's own contact book and sent history.
--
-- The twin of 0027_messenger.sql on the retail side, and separate for the same
-- reason every other table here is: each console addresses its own people out
-- of its own database, and neither can reach the other's list. An agent is not
-- a mall customer and must never land in a mall broadcast by accident.

CREATE TABLE IF NOT EXISTS "DataMessengerContact" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL DEFAULT '',
  "phone"         TEXT NOT NULL DEFAULT '',
  "email"         TEXT NOT NULL DEFAULT '',
  "tags"          TEXT NOT NULL DEFAULT '',
  "note"          TEXT NOT NULL DEFAULT '',
  "source"        TEXT NOT NULL DEFAULT 'manual',
  "archived"      BOOLEAN NOT NULL DEFAULT false,
  "dedupeKey"     TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataMessengerContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataMessengerContact_dedupeKey_key" ON "DataMessengerContact"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DataMessengerContact_archived_lastMessageAt_idx" ON "DataMessengerContact"("archived", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "DataMessengerContact_name_idx" ON "DataMessengerContact"("name");

CREATE TABLE IF NOT EXISTS "DataMessengerMessage" (
  "id"        TEXT NOT NULL,
  "contactId" TEXT,
  "toName"    TEXT NOT NULL DEFAULT '',
  "toPhone"   TEXT NOT NULL DEFAULT '',
  "toEmail"   TEXT NOT NULL DEFAULT '',
  "channel"   TEXT NOT NULL DEFAULT 'sms',
  "subject"   TEXT NOT NULL DEFAULT '',
  "body"      TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'sent',
  "smsOk"     BOOLEAN,
  "emailOk"   BOOLEAN,
  "batchId"   TEXT NOT NULL DEFAULT '',
  "audience"  TEXT NOT NULL DEFAULT '',
  "sentBy"    TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataMessengerMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataMessengerMessage_contactId_createdAt_idx" ON "DataMessengerMessage"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataMessengerMessage_batchId_idx" ON "DataMessengerMessage"("batchId");
CREATE INDEX IF NOT EXISTS "DataMessengerMessage_createdAt_idx" ON "DataMessengerMessage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DataMessengerMessage"
    ADD CONSTRAINT "DataMessengerMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "DataMessengerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
