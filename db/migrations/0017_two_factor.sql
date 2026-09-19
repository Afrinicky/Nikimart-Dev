-- A second step after the password, for the people who want one.
--
-- Optional on purpose. The people on this platform sign in from one phone with
-- one SIM, and a second step nobody chose is a lockout waiting to happen — so
-- it is off until its owner turns it on, and an admin can turn it off again for
-- somebody who has lost the phone the codes were going to.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorChannel" TEXT NOT NULL DEFAULT 'email';

-- A code that has been sent and is waiting to be typed back. The code itself is
-- never stored, only its SHA-256 hash, and `attempts` is what makes six digits
-- worth anything: uncapped they are a million guesses.
CREATE TABLE IF NOT EXISTS "TwoFactorChallenge" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  -- SIGN_IN (raised once a password has been checked) | ENABLE (raised for
  -- somebody already signed in, to prove they can receive codes at all).
  "purpose"    TEXT NOT NULL DEFAULT 'SIGN_IN',
  "codeHash"   TEXT NOT NULL,
  "channel"    TEXT NOT NULL DEFAULT 'email',
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");
CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt");
