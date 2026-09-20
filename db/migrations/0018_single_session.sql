-- One sign-in per account.
--
-- Sessions are stateless tokens, so two people signing in with the same
-- password were two valid tokens with nothing to tell them apart and nothing
-- to revoke. Each sign-in now writes a fresh id here and stamps it into the
-- token it issues; a token carrying any other id belonged to a session that
-- has since been superseded, and is refused on the next request.
--
-- Null means signed out everywhere, which is also what every account starts
-- as: tokens issued before this existed carry no id at all and are refused,
-- so everybody signs in once more and the hole closes immediately.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "activeSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "activeSessionAt" TIMESTAMP(3);
