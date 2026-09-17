-- Registration links issued by Nickimart itself.
--
-- An agent's invite link carries their agent code and pays them a share of
-- what their recruit is charged. This is the other kind: a link the admin
-- hands out directly, where the discount is whatever they set when they made
-- it and nobody earns a referral share, because nobody recruited them.

CREATE TABLE IF NOT EXISTS "DataAgentInvite" (
  "id"            TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "label"         TEXT NOT NULL DEFAULT '',
  "waiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxUses"       INTEGER NOT NULL DEFAULT 0,
  "usedCount"     INTEGER NOT NULL DEFAULT 0,
  "expiresAt"     TIMESTAMP(3),
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataAgentInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentInvite_code_key" ON "DataAgentInvite"("code");
CREATE INDEX IF NOT EXISTS "DataAgentInvite_isActive_createdAt_idx"
  ON "DataAgentInvite"("isActive", "createdAt");

-- Which link an application came through, beside the referral code it already
-- records. The discount itself is snapshotted into the fee columns, so this is
-- for the audit trail rather than for pricing.
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT NOT NULL DEFAULT '';
