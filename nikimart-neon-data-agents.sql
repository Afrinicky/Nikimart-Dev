-- NikiMart — Neon catch-up SQL for the sub-agent platform.
-- Run this on the production (Neon) database before/at deploy, after
-- nikimart-neon-data-bundles.sql.
--
-- It adds the tables behind /agent (the agent portal), /store/<slug> (each
-- agent's public storefront) and Admin → Data → Agents, plus the columns that
-- attribute a bundle order to the agent who sold it.
--
-- Every statement is guarded, so running it twice is harmless.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) New columns on the existing bundle tables.
-- ---------------------------------------------------------------------------

-- What NikiMart charges its own agents for a bundle: the agent's cost basis.
-- 0 means "not resold to agents", which hides the bundle from agent stores.
ALTER TABLE "DataBundle"
    ADD COLUMN IF NOT EXISTS "agentPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Attribution + commission snapshot on every bundle order.
ALTER TABLE "DataOrder"
    ADD COLUMN IF NOT EXISTS "agentId"          TEXT,
    ADD COLUMN IF NOT EXISTS "source"           TEXT NOT NULL DEFAULT 'WEB',
    ADD COLUMN IF NOT EXISTS "agentCost"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "agentCommission"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "commissionPaidAt" TIMESTAMP(3);

ALTER TABLE "AfaRegistration"
    ADD COLUMN IF NOT EXISTS "agentId"          TEXT,
    ADD COLUMN IF NOT EXISTS "source"           TEXT NOT NULL DEFAULT 'WEB',
    ADD COLUMN IF NOT EXISTS "agentCost"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "agentCommission"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "commissionPaidAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 2) The agent account itself.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DataAgent" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "code"            TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "storeName"       TEXT NOT NULL,
    "storeTagline"    TEXT NOT NULL DEFAULT '',
    "storeAbout"      TEXT NOT NULL DEFAULT '',
    "storeOpen"       BOOLEAN NOT NULL DEFAULT true,
    "supportPhone"    TEXT NOT NULL DEFAULT '',
    "supportWhatsapp" TEXT NOT NULL DEFAULT '',
    "whatsappGroup"   TEXT NOT NULL DEFAULT '',
    "afaPrice"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "afaEnabled"      BOOLEAN NOT NULL DEFAULT true,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "balance"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setupFee"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAgent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_userId_key" ON "DataAgent" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_code_key"   ON "DataAgent" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_slug_key"   ON "DataAgent" ("slug");
CREATE INDEX IF NOT EXISTS "DataAgent_status_idx"        ON "DataAgent" ("status");

ALTER TABLE "DataAgent"
    ADD COLUMN IF NOT EXISTS "afaPrice"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "afaEnabled" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 3) Per-agent retail prices.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DataAgentPrice" (
    "id"        TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "network"   TEXT NOT NULL,
    "sizeGb"    DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAgentPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentPrice_agentId_network_sizeGb_key"
    ON "DataAgentPrice" ("agentId", "network", "sizeGb");
CREATE INDEX IF NOT EXISTS "DataAgentPrice_agentId_isActive_idx"
    ON "DataAgentPrice" ("agentId", "isActive");

-- ---------------------------------------------------------------------------
-- 4) The balance ledger. Balances only move by writing one of these rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DataAgentLedger" (
    "id"           TEXT NOT NULL,
    "agentId"      TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "amount"       DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "narration"    TEXT NOT NULL DEFAULT '',
    "reference"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAgentLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAgentLedger_agentId_createdAt_idx"
    ON "DataAgentLedger" ("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentLedger_reference_idx"
    ON "DataAgentLedger" ("reference");

-- ---------------------------------------------------------------------------
-- 5) MoMo commission withdrawals, processed by hand from the admin console.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DataAgentWithdrawal" (
    "id"          TEXT NOT NULL,
    "agentId"     TEXT NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "fee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "momoPhone"   TEXT NOT NULL,
    "momoName"    TEXT NOT NULL,
    "momoNetwork" TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "adminNote"   TEXT NOT NULL DEFAULT '',
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAgentWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAgentWithdrawal_agentId_createdAt_idx"
    ON "DataAgentWithdrawal" ("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentWithdrawal_status_idx"
    ON "DataAgentWithdrawal" ("status");

-- ---------------------------------------------------------------------------
-- 6) Agent announcements and support callbacks.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DataAnnouncement" (
    "id"        TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "tone"      TEXT NOT NULL DEFAULT 'info',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "isPinned"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAnnouncement_isActive_createdAt_idx"
    ON "DataAnnouncement" ("isActive", "createdAt");

CREATE TABLE IF NOT EXISTS "DataSupportRequest" (
    "id"         TEXT NOT NULL,
    "agentId"    TEXT,
    "fullName"   TEXT NOT NULL,
    "phone"      TEXT NOT NULL,
    "language"   TEXT NOT NULL DEFAULT 'English',
    "message"    TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'open',
    "adminNote"  TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataSupportRequest_status_createdAt_idx"
    ON "DataSupportRequest" ("status", "createdAt");

-- ---------------------------------------------------------------------------
-- 7) Foreign keys. Added separately so a re-run never trips over them.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataAgent_userId_fkey') THEN
        ALTER TABLE "DataAgent"
            ADD CONSTRAINT "DataAgent_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataAgentPrice_agentId_fkey') THEN
        ALTER TABLE "DataAgentPrice"
            ADD CONSTRAINT "DataAgentPrice_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataAgentLedger_agentId_fkey') THEN
        ALTER TABLE "DataAgentLedger"
            ADD CONSTRAINT "DataAgentLedger_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataAgentWithdrawal_agentId_fkey') THEN
        ALTER TABLE "DataAgentWithdrawal"
            ADD CONSTRAINT "DataAgentWithdrawal_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataOrder_agentId_fkey') THEN
        ALTER TABLE "DataOrder"
            ADD CONSTRAINT "DataOrder_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AfaRegistration_agentId_fkey') THEN
        ALTER TABLE "AfaRegistration"
            ADD CONSTRAINT "AfaRegistration_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DataOrder_agentId_createdAt_idx"
    ON "DataOrder" ("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AfaRegistration_agentId_createdAt_idx"
    ON "AfaRegistration" ("agentId", "createdAt");

-- ---------------------------------------------------------------------------
-- 8) Settings for the recruitment programme.
-- ---------------------------------------------------------------------------

INSERT INTO "SiteSetting" ("key", "value") VALUES
  ('agentProgramEnabled','1'),
  ('agentSetupFee','30'),
  ('agentWithdrawalFee','1'),
  ('agentMinWithdrawal','10'),
  ('agentAgentMarkupPercent','12'),
  ('agentSupportPhone',''),
  ('agentSupportWhatsapp',''),
  ('agentWhatsappGroup',''),
  ('agentPitch','Resell MTN, Telecel and AirtelTigo bundles under your own store name. You set the prices, we deliver the data.')
ON CONFLICT ("key") DO NOTHING;

-- 9) Seed an agent price for every bundle that has none, so agent storefronts
--    are sellable the moment the first agent signs up. It lands 12% under the
--    public retail price; adjust in Admin → Data → Bundle prices.
UPDATE "DataBundle"
   SET "agentPrice" = ROUND(("price" * 0.88)::numeric, 2)
 WHERE "agentPrice" = 0
   AND "price" > 0;

COMMIT;
