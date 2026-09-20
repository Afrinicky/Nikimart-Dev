-- Rooms: an enquiry, a team, a group, a scheduled session, or two people.
--
-- One shape for all of them, because everything above the first line is the
-- same — people in a room, messages in order, who has read what. What differs
-- is only who may walk in, and that is a rule rather than a table.
--
-- Participants are strings rather than foreign keys. An agent is a row in this
-- database, an admin is a user in the retail one, and a visitor is nobody at
-- all until they type their name; no key spans those, so each is stored as
-- "KIND:id".

CREATE TABLE IF NOT EXISTS "DataConversation" (
  "id"            TEXT NOT NULL,
  -- SUPPORT | GROUP | TEAM | SESSION | DIRECT
  "kind"          TEXT NOT NULL,
  "title"         TEXT NOT NULL DEFAULT '',
  -- Who runs it. Empty for a room the platform runs.
  "ownerKey"      TEXT NOT NULL DEFAULT '',
  "teamLeaderId"  TEXT,
  "sessionId"     TEXT,
  -- What a visitor told us before they started typing.
  "visitorName"   TEXT NOT NULL DEFAULT '',
  "visitorPhone"  TEXT NOT NULL DEFAULT '',
  -- open | closed
  "status"        TEXT NOT NULL DEFAULT 'open',
  -- Denormalised so an inbox can sort without touching every message.
  "lastMessageAt" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataConversation_kind_lastMessageAt_idx"
  ON "DataConversation"("kind", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "DataConversation_teamLeaderId_idx"
  ON "DataConversation"("teamLeaderId");
CREATE INDEX IF NOT EXISTS "DataConversation_sessionId_idx"
  ON "DataConversation"("sessionId");
CREATE INDEX IF NOT EXISTS "DataConversation_status_lastMessageAt_idx"
  ON "DataConversation"("status", "lastMessageAt");

-- One person in one room, and how far they have read.
CREATE TABLE IF NOT EXISTS "DataConversationMember" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  -- AGENT:<id> | ADMIN:<userId> | VISITOR:<token>
  "participant"    TEXT NOT NULL,
  "displayName"    TEXT NOT NULL DEFAULT '',
  -- OWNER | MEMBER
  "role"           TEXT NOT NULL DEFAULT 'MEMBER',
  "lastReadAt"     TIMESTAMP(3),
  "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataConversationMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "DataConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataConversationMember_conversationId_participant_key"
  ON "DataConversationMember"("conversationId", "participant");
CREATE INDEX IF NOT EXISTS "DataConversationMember_participant_idx"
  ON "DataConversationMember"("participant");

-- One message. Written here as well as published to the realtime service,
-- because the service keeps a day and an enquiry is worth following up next
-- week. The row is a few hundred bytes; what would have cost this platform its
-- database is holding connections open, and that is the service's job.
CREATE TABLE IF NOT EXISTS "DataChatMessage" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "participant"    TEXT NOT NULL,
  "authorName"     TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "DataConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataChatMessage_conversationId_createdAt_idx"
  ON "DataChatMessage"("conversationId", "createdAt");

-- Somebody asking to be let into a room. A row rather than a live prompt, so
-- it survives the leader being offline when it is made — which is exactly when
-- it usually is.
CREATE TABLE IF NOT EXISTS "DataConversationRequest" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "participant"    TEXT NOT NULL,
  "displayName"    TEXT NOT NULL DEFAULT '',
  "message"        TEXT NOT NULL DEFAULT '',
  -- pending | approved | declined
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "decidedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataConversationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataConversationRequest_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "DataConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataConversationRequest_conversationId_participant_key"
  ON "DataConversationRequest"("conversationId", "participant");
CREATE INDEX IF NOT EXISTS "DataConversationRequest_status_createdAt_idx"
  ON "DataConversationRequest"("status", "createdAt");
