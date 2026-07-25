-- NikiMart — Neon catch-up SQL for OTP-based password reset.
-- Run on the production (Neon) database at/after deploy. Idempotent.
-- Self-contained: supersedes nikimart-neon-password-reset.sql (safe to run
-- even if that one was never applied).
--
-- Password reset uses a 6-digit OTP (sent by SMS + email). OTPs can repeat
-- across users, so tokenHash is NOT unique, and an attempts counter guards
-- against brute force.

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- If the table pre-existed from the link-based flow, bring it up to date.
ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "PasswordResetToken_tokenHash_key";

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
