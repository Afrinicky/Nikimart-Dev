-- 0026 — an agent who has forgotten their password can get back in.
--
-- Until now they could not. The bundle business signs its own people in, and
-- the mall's reset writes the mall's `User` table, which this side stopped
-- reading in 0023 — so forgetting a password meant waiting for an
-- administrator to set a new one. That is a support ticket for something the
-- person can prove for themselves, and it is also the thing that lifts a
-- stage-3 sign-in lock, so the two people most in need of it were an agent who
-- had forgotten their password and an agent who had been locked out trying to
-- remember it.
--
-- The code is never stored, only a SHA-256 of it. `attempts` is what stops six
-- digits being guessed; requesting a fresh code is throttled separately,
-- because a new code resets that counter and somebody could otherwise ask for
-- one between every five guesses.

CREATE TABLE IF NOT EXISTS "DataPasswordResetToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataPasswordResetToken_userId_idx" ON "DataPasswordResetToken"("userId");
-- The nightly sweep deletes by expiry.
CREATE INDEX IF NOT EXISTS "DataPasswordResetToken_expiresAt_idx" ON "DataPasswordResetToken"("expiresAt");
