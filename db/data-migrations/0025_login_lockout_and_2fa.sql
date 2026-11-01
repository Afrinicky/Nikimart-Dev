-- 0025 — an escalating lock on repeated wrong passwords, and the second step.
--
-- Two things the bundle business was missing once it started signing its own
-- people in.
--
-- The lock first. A fixed-window rate limit answers "how many attempts in ten
-- minutes", which is the right question for a flood and the wrong one for a
-- single account being guessed at patiently. These four columns hold an
-- escalation instead: five wrong passwords cost a minute, five more cost half
-- an hour and tell the administrators, and five after that hold the account
-- until a person lets it go. `lockoutStage` survives a lock expiring, which is
-- what makes it an escalation rather than a loop — waiting out the minute buys
-- half an hour next time, not another minute. It resets on a successful sign
-- in, on an administrator lifting it, or on a password reset.
--
-- Then the code that comes after the password. The mall has had one for a
-- while and the flags came across with the logins in 0023, but there was
-- nothing on this side to honour them: an agent with twoFactorEnabled set was
-- being signed in on the password alone, which is worse than not offering it,
-- because the account's own settings said otherwise. The challenges live here
-- rather than in the mall for the same reason everything else does.

ALTER TABLE "DataUser" ADD COLUMN IF NOT EXISTS "failedLoginCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DataUser" ADD COLUMN IF NOT EXISTS "lockoutStage"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DataUser" ADD COLUMN IF NOT EXISTS "lockedUntil"       TIMESTAMP(3);
ALTER TABLE "DataUser" ADD COLUMN IF NOT EXISTS "lockedAt"          TIMESTAMP(3);
ALTER TABLE "DataUser" ADD COLUMN IF NOT EXISTS "lastFailedLoginAt" TIMESTAMP(3);

-- The console lists held accounts, which is a small table scan without this.
CREATE INDEX IF NOT EXISTS "DataUser_lockoutStage_idx" ON "DataUser"("lockoutStage");

CREATE TABLE IF NOT EXISTS "DataTwoFactorChallenge" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "purpose"    TEXT NOT NULL DEFAULT 'SIGN_IN',
  "codeHash"   TEXT NOT NULL,
  "channel"    TEXT NOT NULL DEFAULT 'email',
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataTwoFactorChallenge_userId_idx" ON "DataTwoFactorChallenge"("userId");
-- The sweep deletes by expiry, so it gets an index rather than a full scan.
CREATE INDEX IF NOT EXISTS "DataTwoFactorChallenge_expiresAt_idx" ON "DataTwoFactorChallenge"("expiresAt");
