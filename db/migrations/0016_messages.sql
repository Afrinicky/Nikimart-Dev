-- 0016 — the mall's own message templates and broadcasts.
--
-- The same two tables as the bundle side's, and deliberately not shared with
-- them. The two businesses talk to different people with different words, and
-- one table would make an agent's message reaching a shopper a mistake waiting
-- to happen rather than an impossibility.

-- One row per message the admin has edited. Absent means "use the default",
-- which is different from an empty string: an empty override is an admin
-- deliberately silencing half a message, and the switches below say so
-- explicitly rather than leaving it to be inferred from blank text.
CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  "key"          TEXT NOT NULL,
  "sms"          TEXT NOT NULL DEFAULT '',
  "emailSubject" TEXT NOT NULL DEFAULT '',
  "emailBody"    TEXT NOT NULL DEFAULT '',
  "smsEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy"    TEXT NOT NULL DEFAULT '',
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("key")
);

-- What was sent on purpose, to whom, and whether it arrived. A broadcast costs
-- real money per recipient and cannot be recalled, so the record of one is
-- part of sending it rather than an extra.
CREATE TABLE IF NOT EXISTS "Broadcast" (
  "id"         TEXT NOT NULL,
  "audience"   TEXT NOT NULL,
  -- sms | email | both
  "channel"    TEXT NOT NULL DEFAULT 'sms',
  "subject"    TEXT NOT NULL DEFAULT '',
  "body"       TEXT NOT NULL,
  -- How many the audience resolved to, and how many the gateway accepted.
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "delivered"  INTEGER NOT NULL DEFAULT 0,
  "failed"     INTEGER NOT NULL DEFAULT 0,
  "sentBy"     TEXT NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");
