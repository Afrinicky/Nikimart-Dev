-- Registration, reworked: the applicant sets their own password and pays
-- before anybody reviews them, and a recruiter can be given their own share of
-- what their recruits pay.
--
-- Nothing here is destructive. Every column is nullable or defaulted, so an
-- application made under the old flow keeps working: no password hash means
-- the account was provisioned the old way, and paymentStatus 'none' means
-- there was never anything to collect.

-- --- The applicant's own password and name --------------------------------
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "lastName"  TEXT NOT NULL DEFAULT '';

-- --- The registration fee, collected at signup ----------------------------
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeAmount"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeReference"  TEXT;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feePaidAt"     TIMESTAMP(3);

-- The rest of the quote they were shown, so an approved registration reads back
-- as the deal that was struck rather than as today's price list.
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeGross"         DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeWaiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeWaived"        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeReferrerShare" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "DataAgentApplication_feeReference_idx"
  ON "DataAgentApplication"("feeReference");

-- --- A recruiter's own share of what their recruits pay -------------------
-- Null is not zero: null follows the programme default as it changes, while an
-- explicit 0 credits this agent nothing whatever the default becomes. Same
-- rule the waiver beside it already follows.
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "referralSharePercent" DOUBLE PRECISION;
