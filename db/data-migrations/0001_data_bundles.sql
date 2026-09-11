-- 0001 — the data-bundle business, on its own database.
--
-- Everything the bundle side owns: the price ladder, bundle and AFA orders, the
-- sub-agent platform, and the settings its console reads. Until now these
-- tables sat in the retail database; this file is what stands them up in the
-- new one. It is written IF NOT EXISTS throughout, so running it against a
-- database that already has them — which is exactly what happens on an
-- environment where DATA_DATABASE_URL is not set yet, and the data migrations
-- fall back to the retail database — changes nothing and reports success.
--
-- The rows are not copied here. Copying live data is a judgement call about
-- somebody's money and it belongs in a script run deliberately, watched, once:
-- `node scripts/copy-data-db.mjs`. This file is schema only, like every other
-- migration.
--
-- Note the one thing that is *not* a foreign key. "DataAgent"."userId" holds a
-- "User"."id" from the retail database, and Postgres cannot reference across
-- databases, so it is a plain indexed column. Code joins the two sides in
-- src/lib/data-bundles/user-link.ts.

CREATE TABLE IF NOT EXISTS "DataBundle" (
  "id"             TEXT             NOT NULL PRIMARY KEY,
  "network"        TEXT             NOT NULL,
  "sizeGb"         DOUBLE PRECISION NOT NULL,
  "price"          DOUBLE PRECISION NOT NULL,
  "costPrice"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "agentPrice"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "teamCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "validity"       TEXT             NOT NULL DEFAULT 'No expiry',
  "isActive"       BOOLEAN          NOT NULL DEFAULT true,
  "order"          INTEGER          NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataBundle_network_sizeGb_key" ON "DataBundle"("network", "sizeGb");
CREATE INDEX IF NOT EXISTS "DataBundle_network_isActive_idx" ON "DataBundle"("network", "isActive");

CREATE TABLE IF NOT EXISTS "DataAgent" (
  "id"                TEXT             NOT NULL PRIMARY KEY,
  "userId"            TEXT             NOT NULL,
  "code"              TEXT             NOT NULL,
  "slug"              TEXT             NOT NULL,
  "storeName"         TEXT             NOT NULL,
  "storeTagline"      TEXT             NOT NULL DEFAULT '',
  "storeAbout"        TEXT             NOT NULL DEFAULT '',
  "storeOpen"         BOOLEAN          NOT NULL DEFAULT true,
  "supportPhone"      TEXT             NOT NULL DEFAULT '',
  "supportWhatsapp"   TEXT             NOT NULL DEFAULT '',
  "whatsappGroup"     TEXT             NOT NULL DEFAULT '',
  "afaPrice"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "afaEnabled"        BOOLEAN          NOT NULL DEFAULT true,
  "status"            TEXT             NOT NULL DEFAULT 'active',
  "balance"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "setupFee"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "setupFeeMethod"    TEXT             NOT NULL DEFAULT 'BALANCE',
  "setupFeePaidAt"    TIMESTAMP(3),
  "setupFeeReference" TEXT,
  "referredById"      TEXT,
  "referralLockedAt"  TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_userId_key" ON "DataAgent"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_code_key"   ON "DataAgent"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgent_slug_key"   ON "DataAgent"("slug");
CREATE INDEX IF NOT EXISTS "DataAgent_status_idx"         ON "DataAgent"("status");
CREATE INDEX IF NOT EXISTS "DataAgent_referredById_idx"   ON "DataAgent"("referredById");
CREATE INDEX IF NOT EXISTS "DataAgent_setupFeePaidAt_idx" ON "DataAgent"("setupFeePaidAt");

DO $$ BEGIN
  ALTER TABLE "DataAgent"
    ADD CONSTRAINT "DataAgent_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataOrder" (
  "id"                   TEXT             NOT NULL PRIMARY KEY,
  "reference"            TEXT             NOT NULL,
  "network"              TEXT             NOT NULL,
  "sizeGb"               DOUBLE PRECISION NOT NULL,
  "price"                DOUBLE PRECISION NOT NULL,
  "costPrice"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recipientPhone"       TEXT             NOT NULL,
  "buyerPhone"           TEXT             NOT NULL,
  "buyerEmail"           TEXT,
  "buyerName"            TEXT,
  "status"               TEXT             NOT NULL DEFAULT 'pending',
  "paymentStatus"        TEXT             NOT NULL DEFAULT 'unpaid',
  "paidAt"               TIMESTAMP(3),
  "providerOrderId"      TEXT,
  "providerCode"         TEXT,
  "providerStatus"       TEXT,
  "providerMessage"      TEXT,
  "dispatchedAt"         TIMESTAMP(3),
  "completedAt"          TIMESTAMP(3),
  "agentId"              TEXT,
  "source"               TEXT             NOT NULL DEFAULT 'WEB',
  "agentCost"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "agentCommission"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionStatus"     TEXT             NOT NULL DEFAULT 'pending',
  "commissionPaidAt"     TIMESTAMP(3),
  "teamAgentId"          TEXT,
  "teamCommission"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "teamCommissionStatus" TEXT             NOT NULL DEFAULT 'pending',
  "teamCommissionPaidAt" TIMESTAMP(3),
  "userId"               TEXT,
  "createdAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataOrder_reference_key" ON "DataOrder"("reference");
CREATE INDEX IF NOT EXISTS "DataOrder_buyerPhone_idx"           ON "DataOrder"("buyerPhone");
CREATE INDEX IF NOT EXISTS "DataOrder_recipientPhone_idx"       ON "DataOrder"("recipientPhone");
CREATE INDEX IF NOT EXISTS "DataOrder_status_idx"               ON "DataOrder"("status");
CREATE INDEX IF NOT EXISTS "DataOrder_userId_idx"               ON "DataOrder"("userId");
CREATE INDEX IF NOT EXISTS "DataOrder_createdAt_idx"            ON "DataOrder"("createdAt");
CREATE INDEX IF NOT EXISTS "DataOrder_agentId_createdAt_idx"    ON "DataOrder"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataOrder_teamAgentId_createdAt_idx" ON "DataOrder"("teamAgentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DataOrder" ADD CONSTRAINT "DataOrder_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DataOrder" ADD CONSTRAINT "DataOrder_teamAgentId_fkey"
    FOREIGN KEY ("teamAgentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AfaRegistration" (
  "id"               TEXT             NOT NULL PRIMARY KEY,
  "reference"        TEXT             NOT NULL,
  "fullName"         TEXT             NOT NULL,
  "phoneNumber"      TEXT             NOT NULL,
  "idNumber"         TEXT             NOT NULL,
  "dateOfBirth"      TEXT             NOT NULL,
  "town"             TEXT             NOT NULL,
  "occupation"       TEXT             NOT NULL,
  "price"            DOUBLE PRECISION NOT NULL,
  "status"           TEXT             NOT NULL DEFAULT 'pending',
  "paymentStatus"    TEXT             NOT NULL DEFAULT 'unpaid',
  "paidAt"           TIMESTAMP(3),
  "providerId"       TEXT,
  "providerStatus"   TEXT,
  "providerMessage"  TEXT,
  "dispatchedAt"     TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "agentId"          TEXT,
  "source"           TEXT             NOT NULL DEFAULT 'WEB',
  "agentCost"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "agentCommission"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionStatus" TEXT             NOT NULL DEFAULT 'pending',
  "commissionPaidAt" TIMESTAMP(3),
  "userId"           TEXT,
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AfaRegistration_reference_key" ON "AfaRegistration"("reference");
CREATE INDEX IF NOT EXISTS "AfaRegistration_phoneNumber_idx"        ON "AfaRegistration"("phoneNumber");
CREATE INDEX IF NOT EXISTS "AfaRegistration_status_idx"             ON "AfaRegistration"("status");
CREATE INDEX IF NOT EXISTS "AfaRegistration_createdAt_idx"          ON "AfaRegistration"("createdAt");
CREATE INDEX IF NOT EXISTS "AfaRegistration_agentId_createdAt_idx"  ON "AfaRegistration"("agentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AfaRegistration" ADD CONSTRAINT "AfaRegistration_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataAgentPrice" (
  "id"        TEXT             NOT NULL PRIMARY KEY,
  "agentId"   TEXT             NOT NULL,
  "network"   TEXT             NOT NULL,
  "sizeGb"    DOUBLE PRECISION NOT NULL,
  "price"     DOUBLE PRECISION NOT NULL,
  "isActive"  BOOLEAN          NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentPrice_agentId_network_sizeGb_key"
  ON "DataAgentPrice"("agentId", "network", "sizeGb");
CREATE INDEX IF NOT EXISTS "DataAgentPrice_agentId_isActive_idx" ON "DataAgentPrice"("agentId", "isActive");

DO $$ BEGIN
  ALTER TABLE "DataAgentPrice" ADD CONSTRAINT "DataAgentPrice_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataAgentLedger" (
  "id"            TEXT             NOT NULL PRIMARY KEY,
  "agentId"       TEXT             NOT NULL,
  "type"          TEXT             NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL,
  "balanceAfter"  DOUBLE PRECISION NOT NULL,
  "narration"     TEXT             NOT NULL DEFAULT '',
  "reference"     TEXT,
  "sourceAgentId" TEXT,
  "referralLevel" INTEGER,
  "dedupeKey"     TEXT,
  "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- The unique index on dedupeKey is what makes a referral or team commission
-- payable exactly once, whatever retries the sweep, the webhook and an admin
-- between them manage. NULLs are distinct in Postgres, so every entry that
-- isn't an automatic commission is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentLedger_dedupeKey_key"        ON "DataAgentLedger"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DataAgentLedger_agentId_createdAt_idx"       ON "DataAgentLedger"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentLedger_reference_idx"               ON "DataAgentLedger"("reference");
CREATE INDEX IF NOT EXISTS "DataAgentLedger_agentId_type_createdAt_idx"  ON "DataAgentLedger"("agentId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentLedger_sourceAgentId_idx"           ON "DataAgentLedger"("sourceAgentId");

DO $$ BEGIN
  ALTER TABLE "DataAgentLedger" ADD CONSTRAINT "DataAgentLedger_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DataAgentLedger" ADD CONSTRAINT "DataAgentLedger_sourceAgentId_fkey"
    FOREIGN KEY ("sourceAgentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataAgentWithdrawal" (
  "id"          TEXT             NOT NULL PRIMARY KEY,
  "agentId"     TEXT             NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "fee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "momoPhone"   TEXT             NOT NULL,
  "momoName"    TEXT             NOT NULL,
  "momoNetwork" TEXT             NOT NULL,
  "status"      TEXT             NOT NULL DEFAULT 'pending',
  "adminNote"   TEXT             NOT NULL DEFAULT '',
  "processedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DataAgentWithdrawal_agentId_createdAt_idx" ON "DataAgentWithdrawal"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentWithdrawal_status_idx"            ON "DataAgentWithdrawal"("status");

DO $$ BEGIN
  ALTER TABLE "DataAgentWithdrawal" ADD CONSTRAINT "DataAgentWithdrawal_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataAnnouncement" (
  "id"        TEXT         NOT NULL PRIMARY KEY,
  "title"     TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "tone"      TEXT         NOT NULL DEFAULT 'info',
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "isPinned"  BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DataAnnouncement_isActive_createdAt_idx" ON "DataAnnouncement"("isActive", "createdAt");

CREATE TABLE IF NOT EXISTS "DataSupportRequest" (
  "id"         TEXT         NOT NULL PRIMARY KEY,
  "agentId"    TEXT,
  "fullName"   TEXT         NOT NULL,
  "phone"      TEXT         NOT NULL,
  "language"   TEXT         NOT NULL DEFAULT 'English',
  "message"    TEXT         NOT NULL,
  "status"     TEXT         NOT NULL DEFAULT 'open',
  "adminNote"  TEXT         NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DataSupportRequest_status_createdAt_idx" ON "DataSupportRequest"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "DataAgentApplication" (
  "id"              TEXT         NOT NULL PRIMARY KEY,
  "fullName"        TEXT         NOT NULL,
  "phone"           TEXT         NOT NULL,
  "email"           TEXT         NOT NULL,
  "storeName"       TEXT         NOT NULL DEFAULT '',
  "desiredSlug"     TEXT         NOT NULL,
  "note"            TEXT         NOT NULL DEFAULT '',
  "referralCode"    TEXT         NOT NULL DEFAULT '',
  "referrerId"      TEXT,
  "feeMethod"       TEXT         NOT NULL DEFAULT 'BALANCE',
  "status"          TEXT         NOT NULL DEFAULT 'pending',
  "reviewedBy"      TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "adminNote"       TEXT         NOT NULL DEFAULT '',
  "setupTokenHash"  TEXT,
  "setupExpiresAt"  TIMESTAMP(3),
  "agentId"         TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "termsAcceptedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "DataAgentApplication_status_createdAt_idx" ON "DataAgentApplication"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentApplication_email_idx"            ON "DataAgentApplication"("email");
CREATE INDEX IF NOT EXISTS "DataAgentApplication_desiredSlug_idx"      ON "DataAgentApplication"("desiredSlug");
CREATE INDEX IF NOT EXISTS "DataAgentApplication_referrerId_idx"       ON "DataAgentApplication"("referrerId");

CREATE TABLE IF NOT EXISTS "DataSetting" (
  "key"   TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- Catching up a database that already had these tables.
--
-- On an environment where DATA_DATABASE_URL is not set, everything above is a
-- no-op against the retail database — the tables are already there, from before
-- the split — and the new columns would be missed. These add them.
-- --------------------------------------------------------------------------
ALTER TABLE "DataBundle"           ADD COLUMN IF NOT EXISTS "teamCommission"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgent"            ADD COLUMN IF NOT EXISTS "setupFeeMethod"       TEXT NOT NULL DEFAULT 'BALANCE';
ALTER TABLE "DataAgent"            ADD COLUMN IF NOT EXISTS "setupFeePaidAt"       TIMESTAMP(3);
ALTER TABLE "DataAgent"            ADD COLUMN IF NOT EXISTS "setupFeeReference"    TEXT;
ALTER TABLE "DataAgent"            ADD COLUMN IF NOT EXISTS "referredById"         TEXT;
ALTER TABLE "DataAgent"            ADD COLUMN IF NOT EXISTS "referralLockedAt"     TIMESTAMP(3);
ALTER TABLE "DataOrder"            ADD COLUMN IF NOT EXISTS "teamAgentId"          TEXT;
ALTER TABLE "DataOrder"            ADD COLUMN IF NOT EXISTS "teamCommission"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataOrder"            ADD COLUMN IF NOT EXISTS "teamCommissionStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DataOrder"            ADD COLUMN IF NOT EXISTS "teamCommissionPaidAt" TIMESTAMP(3);
ALTER TABLE "DataAgentLedger"      ADD COLUMN IF NOT EXISTS "sourceAgentId"        TEXT;
ALTER TABLE "DataAgentLedger"      ADD COLUMN IF NOT EXISTS "referralLevel"        INTEGER;
ALTER TABLE "DataAgentLedger"      ADD COLUMN IF NOT EXISTS "dedupeKey"            TEXT;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "referralCode"         TEXT NOT NULL DEFAULT '';
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "referrerId"           TEXT;
ALTER TABLE "DataAgentApplication" ADD COLUMN IF NOT EXISTS "feeMethod"            TEXT NOT NULL DEFAULT 'BALANCE';

-- An agent who joined before the fee was tracked cleared it out of commission
-- the moment their balance came back through zero, which is what
-- setupFeePaidAt now records. Backfilling it would be a data change, so it is
-- left to lib/data-bundles/referrals.ts, which settles it on the next ledger
-- movement. Nobody is owed a referral reward for an agent recruited before the
-- programme existed, so nothing is lost either way.
