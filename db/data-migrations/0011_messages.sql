-- The words Nickimart sends people, and the broadcasts it sends on purpose.
--
-- Every automatic message used to be a string literal in the code, which meant
-- changing a word a customer actually reads needed a developer and a deploy.
-- The defaults still live in the code — a default has to survive an empty
-- database — but a row here overrides one, so the text is the admin's.

-- One row per message the admin has edited. Absent means "use the default",
-- which is different from an empty string: an empty override is an admin
-- deliberately silencing half a message, and the switches below say so
-- explicitly rather than leaving it to be inferred from blank text.
CREATE TABLE IF NOT EXISTS "DataMessageTemplate" (
  "key"          TEXT NOT NULL,
  "sms"          TEXT NOT NULL DEFAULT '',
  "emailSubject" TEXT NOT NULL DEFAULT '',
  "emailBody"    TEXT NOT NULL DEFAULT '',
  "smsEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy"    TEXT NOT NULL DEFAULT '',
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataMessageTemplate_pkey" PRIMARY KEY ("key")
);

-- What was sent on purpose, to whom, and whether it arrived. A broadcast costs
-- real money per recipient and cannot be recalled, so the record of one is
-- part of sending it rather than an extra.
CREATE TABLE IF NOT EXISTS "DataBroadcast" (
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
  CONSTRAINT "DataBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataBroadcast_createdAt_idx" ON "DataBroadcast"("createdAt");
