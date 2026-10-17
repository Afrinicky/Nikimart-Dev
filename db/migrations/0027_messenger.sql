-- 0027 — a contact book, and a record of everything said out of it.
--
-- The console could already send two things: a message the platform raises by
-- itself, and a broadcast to an audience it worked out from its own tables.
-- What it could not do is the ordinary thing — write to one person, or to
-- eleven people you chose, the way anybody writes a text.
--
-- Contacts are deliberately not accounts. A contact book holds a supplier, a
-- courier, a landlord, a market trader who has never signed up for anything,
-- filed under whatever name you'd look them up by.
--
-- One row per message per recipient, rather than one row per broadcast with a
-- count. It costs rows and buys the only thing that matters when somebody says
-- "I never got it": their row, and whether the gateway took it.

CREATE TABLE IF NOT EXISTS "MessengerContact" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL DEFAULT '',
  "phone"         TEXT NOT NULL DEFAULT '',
  "email"         TEXT NOT NULL DEFAULT '',
  -- Comma-separated labels; a group is a label, so a contact can be in several.
  "tags"          TEXT NOT NULL DEFAULT '',
  "note"          TEXT NOT NULL DEFAULT '',
  -- manual | import | the audience key it was pulled in from.
  "source"        TEXT NOT NULL DEFAULT 'manual',
  "archived"      BOOLEAN NOT NULL DEFAULT false,
  -- Normalised phone, else lowercased email. Re-importing a spreadsheet is the
  -- common case, not the edge one, and it has to update rather than duplicate.
  "dedupeKey"     TEXT NOT NULL,
  -- Denormalised so the chat list sorts without reading every message.
  "lastMessageAt" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessengerContact_dedupeKey_key" ON "MessengerContact"("dedupeKey");
CREATE INDEX IF NOT EXISTS "MessengerContact_archived_lastMessageAt_idx" ON "MessengerContact"("archived", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "MessengerContact_name_idx" ON "MessengerContact"("name");

CREATE TABLE IF NOT EXISTS "MessengerMessage" (
  "id"        TEXT NOT NULL,
  "contactId" TEXT,
  -- Snapshotted beside the relation: a contact deleted next year must not take
  -- the record of what they were told with them.
  "toName"    TEXT NOT NULL DEFAULT '',
  "toPhone"   TEXT NOT NULL DEFAULT '',
  "toEmail"   TEXT NOT NULL DEFAULT '',
  -- sms | email | both
  "channel"   TEXT NOT NULL DEFAULT 'sms',
  "subject"   TEXT NOT NULL DEFAULT '',
  "body"      TEXT NOT NULL,
  -- sent | partial | failed
  "status"    TEXT NOT NULL DEFAULT 'sent',
  "smsOk"     BOOLEAN,
  "emailOk"   BOOLEAN,
  -- Shared by every message of one broadcast; empty on a one-to-one send.
  "batchId"   TEXT NOT NULL DEFAULT '',
  "audience"  TEXT NOT NULL DEFAULT '',
  "sentBy"    TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MessengerMessage_contactId_createdAt_idx" ON "MessengerMessage"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "MessengerMessage_batchId_idx" ON "MessengerMessage"("batchId");
CREATE INDEX IF NOT EXISTS "MessengerMessage_createdAt_idx" ON "MessengerMessage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "MessengerMessage"
    ADD CONSTRAINT "MessengerMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "MessengerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
