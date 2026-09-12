-- 0004 — the leaderboard, the points it pays and the rewards they buy.
--
-- The boards themselves are not stored. Top Sales, Top Recruiters and Current
-- Performance are counted from the orders and referrals that already exist, so
-- a standing can never drift from the business it describes and there is
-- nothing to rebuild when an order is refunded.
--
-- What is stored is the part counting cannot reproduce: the points awarded for
-- a place in a period that has since closed, the rewards an admin has put on
-- the shelf, and what agents have spent their points on.
--
-- Nothing starts happening because of this file. The whole feature is off
-- until an admin turns it on, and no reward exists until one is created.

ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "pointsBalance" INTEGER NOT NULL DEFAULT 0;

-- Every movement of an agent's points, and the only thing that moves
-- "pointsBalance" — the same rule the cedi ledger follows.
CREATE TABLE IF NOT EXISTS "DataAgentPoint" (
  "id"           TEXT         NOT NULL PRIMARY KEY,
  "agentId"      TEXT         NOT NULL,
  "type"         TEXT         NOT NULL,
  "points"       INTEGER      NOT NULL,
  "balanceAfter" INTEGER      NOT NULL,
  "narration"    TEXT         NOT NULL DEFAULT '',
  "periodKey"    TEXT,
  "rank"         INTEGER,
  "dedupeKey"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- What makes a placement pay exactly once, whatever runs the award and however
-- many times it runs.
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentPoint_dedupeKey_key" ON "DataAgentPoint"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DataAgentPoint_agentId_createdAt_idx" ON "DataAgentPoint"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentPoint_periodKey_idx" ON "DataAgentPoint"("periodKey");

DO $$ BEGIN
  ALTER TABLE "DataAgentPoint" ADD CONSTRAINT "DataAgentPoint_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A reward on the shelf: what it is called, what it costs in points, and
-- whether it pays cedis or a data bundle.
CREATE TABLE IF NOT EXISTS "DataRewardTier" (
  "id"         TEXT             NOT NULL PRIMARY KEY,
  "label"      TEXT             NOT NULL,
  "kind"       TEXT             NOT NULL DEFAULT 'CASH',
  "points"     INTEGER          NOT NULL,
  "cashAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "network"    TEXT             NOT NULL DEFAULT '',
  "sizeGb"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN          NOT NULL DEFAULT true,
  "order"      INTEGER          NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DataRewardTier_isActive_order_idx" ON "DataRewardTier"("isActive", "order");

-- An agent spending points. The reward is snapshotted onto the row, so
-- retiring or repricing a tier never rewrites what somebody redeemed.
CREATE TABLE IF NOT EXISTS "DataRewardRedemption" (
  "id"             TEXT             NOT NULL PRIMARY KEY,
  "agentId"        TEXT             NOT NULL,
  "tierId"         TEXT,
  "label"          TEXT             NOT NULL,
  "kind"           TEXT             NOT NULL DEFAULT 'CASH',
  "points"         INTEGER          NOT NULL,
  "cashAmount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "network"        TEXT             NOT NULL DEFAULT '',
  "sizeGb"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recipientPhone" TEXT             NOT NULL DEFAULT '',
  "status"         TEXT             NOT NULL DEFAULT 'pending',
  "adminNote"      TEXT             NOT NULL DEFAULT '',
  "processedBy"    TEXT,
  "processedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DataRewardRedemption_agentId_createdAt_idx" ON "DataRewardRedemption"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataRewardRedemption_status_createdAt_idx" ON "DataRewardRedemption"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DataRewardRedemption" ADD CONSTRAINT "DataRewardRedemption_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DataRewardRedemption" ADD CONSTRAINT "DataRewardRedemption_tierId_fkey"
    FOREIGN KEY ("tierId") REFERENCES "DataRewardTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
