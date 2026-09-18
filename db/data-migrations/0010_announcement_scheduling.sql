-- Announcements grow up: who they are for, and when they matter.
--
-- A notice used to be on or off, and live the moment it was saved. Both are
-- too blunt for the thing it is actually used for — an admin writing on Sunday
-- about a price change that starts on Monday, or a warning about one network
-- that every agent sees whether they sell it or not.

-- Who it is for: AGENTS, CUSTOMERS or EVERYONE. Existing notices were only
-- ever shown to agents, so that is what they keep.
ALTER TABLE "DataAnnouncement"
  ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'AGENTS';

-- When it starts mattering. Null means the moment it was written, which is how
-- every existing notice behaved.
ALTER TABLE "DataAnnouncement" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);

-- When it stops. Null means it stands until somebody hides it — again, the
-- behaviour every existing notice already has.
ALTER TABLE "DataAnnouncement" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Who wrote it. An announcement is somebody's words, and a broadcast nobody
-- can be asked about is a broadcast nobody will own.
ALTER TABLE "DataAnnouncement" ADD COLUMN IF NOT EXISTS "createdBy" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "DataAnnouncement_audience_isActive_idx"
  ON "DataAnnouncement"("audience", "isActive");
