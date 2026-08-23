-- NikiMart catch-up migration: editable policies.
--
-- Until this table exists the policy pages publish the built-in text from
-- lib/legal.ts and the admin editor refuses to save, so nothing breaks in the
-- gap — but nothing can be edited either.
--
-- Safe to re-run. No rows are inserted: a policy with no row publishes the
-- built-in wording, which is the intended starting state.

CREATE TABLE IF NOT EXISTS "LegalPolicy" (
  "slug"      TEXT         NOT NULL,
  "title"     TEXT         NOT NULL,
  "intro"     TEXT         NOT NULL DEFAULT '',
  "body"      TEXT         NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT         NOT NULL DEFAULT '',
  CONSTRAINT "LegalPolicy_pkey" PRIMARY KEY ("slug")
);

-- When each person accepted the terms. Nullable, because accounts that predate
-- the acceptance gate never did — and recording "unknown" honestly is better
-- than back-dating a consent nobody gave.
ALTER TABLE "User"                 ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Vendor"               ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
