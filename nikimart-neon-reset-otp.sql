-- NikiMart — Neon catch-up SQL for OTP-based password reset.
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Password reset now uses a 6-digit OTP (sent by SMS + email) instead of a
-- link. OTPs can repeat across users, so tokenHash is no longer unique, and an
-- attempts counter guards against brute force.

ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "PasswordResetToken_tokenHash_key";
