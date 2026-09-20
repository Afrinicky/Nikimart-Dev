-- Live sessions a leader holds with their team.
--
-- What is stored here is the durable part: when the session was held, who
-- turned up, and what was said once it is over. The conversation itself is
-- carried by the realtime service and never touches this database while it is
-- happening — a chat that wrote a row per message as it was typed would spend
-- the platform's database allowance on text nobody reads twice.

CREATE TABLE IF NOT EXISTS "DataTeamSession" (
  "id"        TEXT NOT NULL,
  "leaderId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "agenda"    TEXT NOT NULL DEFAULT '',
  -- scheduled | live | ended
  "status"    TEXT NOT NULL DEFAULT 'scheduled',
  "startsAt"  TIMESTAMP(3) NOT NULL,
  "openedAt"  TIMESTAMP(3),
  "endedAt"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTeamSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataTeamSession_leaderId_fkey" FOREIGN KEY ("leaderId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataTeamSession_leaderId_startsAt_idx"
  ON "DataTeamSession"("leaderId", "startsAt");
CREATE INDEX IF NOT EXISTS "DataTeamSession_status_startsAt_idx"
  ON "DataTeamSession"("status", "startsAt");

-- Who turned up. One row per person per session, written when they join rather
-- than per heartbeat: a leader wants to know who came, not a second-by-second
-- log of who had the tab open.
CREATE TABLE IF NOT EXISTS "DataTeamSessionAttendee" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "joinedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeen"  TIMESTAMP(3),
  CONSTRAINT "DataTeamSessionAttendee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataTeamSessionAttendee_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "DataTeamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataTeamSessionAttendee_agentId_fkey" FOREIGN KEY ("agentId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataTeamSessionAttendee_sessionId_agentId_key"
  ON "DataTeamSessionAttendee"("sessionId", "agentId");
CREATE INDEX IF NOT EXISTS "DataTeamSessionAttendee_sessionId_idx"
  ON "DataTeamSessionAttendee"("sessionId");

-- The transcript, written in one batch when the session ends rather than a row
-- per message as it is typed.
CREATE TABLE IF NOT EXISTS "DataTeamSessionMessage" (
  "id"         TEXT NOT NULL,
  "sessionId"  TEXT NOT NULL,
  "agentId"    TEXT,
  "authorName" TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "saidAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTeamSessionMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataTeamSessionMessage_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "DataTeamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataTeamSessionMessage_sessionId_saidAt_idx"
  ON "DataTeamSessionMessage"("sessionId", "saidAt");
