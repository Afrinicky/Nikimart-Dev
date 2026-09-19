-- A leader talking to their own team.
--
-- The hierarchy itself needs no table: an agent's recruiter is already on their
-- row, and that chain is what the referral programme pays on. What was missing
-- was the talking — a leader could see who had joined and had no way to say
-- anything to them, or to remember what was said last time.

-- Something a leader wrote to their own team. Distinct from a Nickimart
-- announcement, which comes from the platform and reaches everybody: this one
-- belongs to one leader and reaches their own two levels.
CREATE TABLE IF NOT EXISTS "DataTeamPost" (
  "id"        TEXT NOT NULL,
  "leaderId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "isPinned"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTeamPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataTeamPost_leaderId_fkey" FOREIGN KEY ("leaderId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataTeamPost_leaderId_createdAt_idx"
  ON "DataTeamPost"("leaderId", "createdAt");

-- A leader's private note about one member. Mentorship is mostly remembering:
-- what was agreed, what they were struggling with, what they asked for.
-- Readable only by the leader who wrote it — a member reading their own
-- coaching notes changes what gets written down, and then the notes stop being
-- worth writing.
CREATE TABLE IF NOT EXISTS "DataTeamNote" (
  "id"        TEXT NOT NULL,
  "leaderId"  TEXT NOT NULL,
  "memberId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTeamNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataTeamNote_leaderId_fkey" FOREIGN KEY ("leaderId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataTeamNote_memberId_fkey" FOREIGN KEY ("memberId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataTeamNote_leaderId_memberId_createdAt_idx"
  ON "DataTeamNote"("leaderId", "memberId", "createdAt");
