-- The affiliate referral programme: teams, registration fees and waivers.
--
-- The affiliate programme could pay somebody for a sale they referred and
-- nothing else. The data-bundle agents have had the rest for a while — you
-- recruit people, you earn a share of what they sell, and what they pay to
-- join is split between the platform and whoever brought them in — and this is
-- the same arrangement on the retail side.
--
-- What the columns are for:
--
--   * Affiliate.referredById is the recruiter, set once from the code the
--     application quoted and frozen by referralLockedAt. Level 2 is walked at
--     read time; the programme stops there.
--   * The registration* columns are what one affiliate was actually charged
--     and how that number came about. Recorded rather than recomputed, so
--     changing the fee tomorrow never rewrites what somebody already paid.
--   * AffiliateInvite is a registration link Nickimart issued itself: a
--     discount with nobody owed a share of it.
--   * AffiliateTeamEarning is money owed for somebody else's activity — a cut
--     of a recruit's commission, or a reward for recruiting them. dedupeKey is
--     what stops a retried delivery notification paying it twice.
--
-- Additive and idempotent, per db/migrations/README.md. Nothing here drops or
-- rewrites a column the running code reads, and every default leaves an
-- existing affiliate exactly where they are: no recruiter, no fee, nothing
-- owed.

-- --------------------------------------------------------------------------
-- 1) Affiliate: their team, and what they paid to join
-- --------------------------------------------------------------------------
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "referralLockedAt" TIMESTAMP(3);
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "referralWaiverPercent" DOUBLE PRECISION;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "referralSharePercent" DOUBLE PRECISION;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationGross" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationWaiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationWaived" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationReferrerShare" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationMethod" TEXT NOT NULL DEFAULT 'WAIVED';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationPaidAt" TIMESTAMP(3);
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationReference" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationSettledBy" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "registrationOwed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "inviteId" TEXT;

CREATE INDEX IF NOT EXISTS "Affiliate_referredById_idx" ON "Affiliate"("referredById");
CREATE INDEX IF NOT EXISTS "Affiliate_registrationPaidAt_idx" ON "Affiliate"("registrationPaidAt");

DO $$
BEGIN
  ALTER TABLE "Affiliate"
    ADD CONSTRAINT "Affiliate_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2) AffiliateApplication: who recruited them, and what they were quoted
-- --------------------------------------------------------------------------
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "referralCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "inviteId" TEXT;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeGross" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeWaiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeWaived" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeReferrerShare" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeMethod" TEXT NOT NULL DEFAULT 'WAIVED';
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feeReference" TEXT;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "feePaidAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AffiliateApplication_referredById_idx"
  ON "AffiliateApplication"("referredById");

-- --------------------------------------------------------------------------
-- 3) AffiliateInvite: a registration link with a price on it
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateInvite" (
  "id"            TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "label"         TEXT NOT NULL DEFAULT '',
  "waiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxUses"       INTEGER NOT NULL DEFAULT 0,
  "usedCount"     INTEGER NOT NULL DEFAULT 0,
  "expiresAt"     TIMESTAMP(3),
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdBy"     TEXT NOT NULL DEFAULT '',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateInvite_code_key" ON "AffiliateInvite"("code");
CREATE INDEX IF NOT EXISTS "AffiliateInvite_isActive_createdAt_idx"
  ON "AffiliateInvite"("isActive", "createdAt");

-- --------------------------------------------------------------------------
-- 4) AffiliateTeamEarning: what somebody's team earned them
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateTeamEarning" (
  "id"                TEXT NOT NULL,
  "affiliateId"       TEXT NOT NULL,
  "sourceAffiliateId" TEXT,
  "kind"              TEXT NOT NULL DEFAULT 'team_sale',
  "level"             INTEGER NOT NULL DEFAULT 1,
  "commissionId"      TEXT,
  "orderId"           TEXT,
  "baseAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amount"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "narration"         TEXT NOT NULL DEFAULT '',
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "holdUntil"         TIMESTAMP(3),
  "clearedAt"         TIMESTAMP(3),
  "reversedAt"        TIMESTAMP(3),
  "reversedAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reversalReason"    TEXT NOT NULL DEFAULT '',
  "payoutId"          TEXT,
  "dedupeKey"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateTeamEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateTeamEarning_dedupeKey_key"
  ON "AffiliateTeamEarning"("dedupeKey");
CREATE INDEX IF NOT EXISTS "AffiliateTeamEarning_affiliateId_status_idx"
  ON "AffiliateTeamEarning"("affiliateId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateTeamEarning_sourceAffiliateId_idx"
  ON "AffiliateTeamEarning"("sourceAffiliateId");
CREATE INDEX IF NOT EXISTS "AffiliateTeamEarning_commissionId_idx"
  ON "AffiliateTeamEarning"("commissionId");
CREATE INDEX IF NOT EXISTS "AffiliateTeamEarning_payoutId_idx"
  ON "AffiliateTeamEarning"("payoutId");
CREATE INDEX IF NOT EXISTS "AffiliateTeamEarning_createdAt_idx"
  ON "AffiliateTeamEarning"("createdAt");

DO $$
BEGIN
  ALTER TABLE "AffiliateTeamEarning"
    ADD CONSTRAINT "AffiliateTeamEarning_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AffiliateTeamEarning"
    ADD CONSTRAINT "AffiliateTeamEarning_sourceAffiliateId_fkey"
    FOREIGN KEY ("sourceAffiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AffiliateTeamEarning"
    ADD CONSTRAINT "AffiliateTeamEarning_commissionId_fkey"
    FOREIGN KEY ("commissionId") REFERENCES "AffiliateCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AffiliateTeamEarning"
    ADD CONSTRAINT "AffiliateTeamEarning_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
