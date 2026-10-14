-- The affiliate console.
--
-- Three things the programme could not do before, and the tables that give it
-- them: a list of what each affiliate chose to promote with a link of its own
-- per product, a record of who arrived through which link and for how long
-- that attribution holds, and a per-order-line commission ledger that survives
-- the things that actually happen to orders — delivery, cancellation, a return,
-- a partial refund, and a payment notification the gateway sends twice.
--
-- Additive and idempotent, per db/migrations/README.md. Nothing here drops or
-- rewrites a column the running code reads.

-- --------------------------------------------------------------------------
-- 1) Affiliate: application state, payout details, the share caption
-- --------------------------------------------------------------------------
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "shareMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "flyerTheme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "payoutMethod" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "payoutName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "payoutNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "payoutNetwork" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "approvedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "suspendReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "lastSharedAt" TIMESTAMP(3);

-- --------------------------------------------------------------------------
-- 2) AffiliatePayout: who asked, who decided, and where it went
-- --------------------------------------------------------------------------
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "accountName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "network" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "decidedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AffiliatePayout" ADD COLUMN IF NOT EXISTS "rejectReason" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");

-- --------------------------------------------------------------------------
-- 3) Applications
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "channels" TEXT NOT NULL DEFAULT '[]',
    "audience" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "desiredCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT NOT NULL DEFAULT '',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "affiliateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateApplication_status_createdAt_idx"
  ON "AffiliateApplication"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateApplication_userId_idx"
  ON "AffiliateApplication"("userId");

-- --------------------------------------------------------------------------
-- 4) The products an affiliate promotes, each with its own link code
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateProduct" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "linkCode" TEXT NOT NULL,
    "shareMessage" TEXT NOT NULL DEFAULT '',
    "flyerTheme" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastSharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateProduct_linkCode_key"
  ON "AffiliateProduct"("linkCode");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateProduct_affiliateId_productId_key"
  ON "AffiliateProduct"("affiliateId", "productId");
CREATE INDEX IF NOT EXISTS "AffiliateProduct_productId_idx"
  ON "AffiliateProduct"("productId");
CREATE INDEX IF NOT EXISTS "AffiliateProduct_affiliateId_createdAt_idx"
  ON "AffiliateProduct"("affiliateId", "createdAt");

-- --------------------------------------------------------------------------
-- 5) Attribution: who a visitor belongs to, and until when
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "productId" TEXT,
    "linkCode" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'link',
    "landingPath" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "model" TEXT NOT NULL DEFAULT 'last',
    "orders" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReferral_affiliateId_visitorId_key"
  ON "AffiliateReferral"("affiliateId", "visitorId");
CREATE INDEX IF NOT EXISTS "AffiliateReferral_visitorId_lastSeenAt_idx"
  ON "AffiliateReferral"("visitorId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "AffiliateReferral_userId_idx"
  ON "AffiliateReferral"("userId");
CREATE INDEX IF NOT EXISTS "AffiliateReferral_expiresAt_idx"
  ON "AffiliateReferral"("expiresAt");

-- --------------------------------------------------------------------------
-- 6) Clicks
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "productId" TEXT,
    "linkCode" TEXT NOT NULL DEFAULT '',
    "visitorId" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "referer" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "uaHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateClick_affiliateId_createdAt_idx"
  ON "AffiliateClick"("affiliateId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateClick_productId_idx" ON "AffiliateClick"("productId");
CREATE INDEX IF NOT EXISTS "AffiliateClick_linkCode_idx" ON "AffiliateClick"("linkCode");

-- --------------------------------------------------------------------------
-- 7) The commission ledger
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fundedBy" TEXT NOT NULL DEFAULT '',
    "ruleSource" TEXT NOT NULL DEFAULT 'default',
    "platformCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "holdUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reversalReason" TEXT NOT NULL DEFAULT '',
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- One row per order line. This is the guard that makes a duplicate payment
-- notification a no-op instead of a double payout.
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCommission_orderItemId_key"
  ON "AffiliateCommission"("orderItemId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_affiliateId_status_idx"
  ON "AffiliateCommission"("affiliateId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_orderId_idx" ON "AffiliateCommission"("orderId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_productId_idx" ON "AffiliateCommission"("productId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_payoutId_idx" ON "AffiliateCommission"("payoutId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_createdAt_idx" ON "AffiliateCommission"("createdAt");

-- --------------------------------------------------------------------------
-- 8) Adjustments, fraud flags, audit trail
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AffiliateAdjustment" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateAdjustment_affiliateId_createdAt_idx"
  ON "AffiliateAdjustment"("affiliateId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateAdjustment_commissionId_idx"
  ON "AffiliateAdjustment"("commissionId");
CREATE INDEX IF NOT EXISTS "AffiliateAdjustment_orderId_idx"
  ON "AffiliateAdjustment"("orderId");

CREATE TABLE IF NOT EXISTS "AffiliateFraudFlag" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warn',
    "detail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateFraudFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateFraudFlag_affiliateId_status_idx"
  ON "AffiliateFraudFlag"("affiliateId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateFraudFlag_kind_createdAt_idx"
  ON "AffiliateFraudFlag"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateFraudFlag_orderId_idx"
  ON "AffiliateFraudFlag"("orderId");

CREATE TABLE IF NOT EXISTS "AffiliateEvent" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT,
    "actorId" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateEvent_affiliateId_createdAt_idx"
  ON "AffiliateEvent"("affiliateId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateEvent_action_createdAt_idx"
  ON "AffiliateEvent"("action", "createdAt");

-- --------------------------------------------------------------------------
-- 9) Foreign keys
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateProduct_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateProduct" ADD CONSTRAINT "AffiliateProduct_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateProduct_productId_fkey') THEN
    ALTER TABLE "AffiliateProduct" ADD CONSTRAINT "AffiliateProduct_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateReferral_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateClick_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_orderId_fkey') THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_orderItemId_fkey') THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_productId_fkey') THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_payoutId_fkey') THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey"
      FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateAdjustment_commissionId_fkey') THEN
    ALTER TABLE "AffiliateAdjustment" ADD CONSTRAINT "AffiliateAdjustment_commissionId_fkey"
      FOREIGN KEY ("commissionId") REFERENCES "AffiliateCommission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateFraudFlag_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateFraudFlag" ADD CONSTRAINT "AffiliateFraudFlag_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateEvent_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateEvent" ADD CONSTRAINT "AffiliateEvent_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
