-- 0027 — Services: the paperwork Nickimart does for people.
--
-- The bundle business gets a second shelf. Passport applications, business
-- registration, birth certificates — things with a fee, a form and a
-- turnaround rather than a size in gigabytes. It is built to the same shape as
-- the first shelf on purpose: the admin lists what is for sale, an agent puts
-- it on their storefront at their own price and keeps the difference, and the
-- customer pays through the same Paystack checkout and tracks the order with
-- the same reference.
--
-- Nothing about adding a service touches code. What it is called, what it
-- costs, what the form asks and how fast it can be done are rows here —
-- `fields` and `speeds` are JSON, validated on the way in and on the way out
-- (see src/lib/data-bundles/service-fields.ts), because a form that needs a
-- deploy is a form nobody adds.
--
-- Documents live on their own table rather than inside the order's answers.
-- A Ghana Card photograph is a megabyte, and a list of two hundred orders must
-- not drag two hundred megabytes behind it.

CREATE TABLE IF NOT EXISTS "DataService" (
  "id"         TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "tagline"    TEXT NOT NULL DEFAULT '',
  "summary"    TEXT NOT NULL DEFAULT '',
  "imageUrl"   TEXT NOT NULL DEFAULT '',
  "icon"       TEXT NOT NULL DEFAULT '📄',
  "accentFrom" TEXT NOT NULL DEFAULT '#ff6a00',
  "accentTo"   TEXT NOT NULL DEFAULT '#ff9a3d',
  "fields"     TEXT NOT NULL DEFAULT '[]',
  "terms"      TEXT NOT NULL DEFAULT '',
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "onStore"    BOOLEAN NOT NULL DEFAULT true,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataService_slug_key" ON "DataService"("slug");
CREATE INDEX IF NOT EXISTS "DataService_isActive_order_idx" ON "DataService"("isActive", "order");

CREATE TABLE IF NOT EXISTS "DataServiceVariant" (
  "id"          TEXT NOT NULL,
  "serviceId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "price"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "agentPrice"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "turnaround"  TEXT NOT NULL DEFAULT '',
  "speeds"      TEXT NOT NULL DEFAULT '[]',
  "fields"      TEXT NOT NULL DEFAULT '[]',
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataServiceVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataServiceVariant_serviceId_fkey" FOREIGN KEY ("serviceId")
    REFERENCES "DataService"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataServiceVariant_serviceId_order_idx"
  ON "DataServiceVariant"("serviceId", "order");

CREATE TABLE IF NOT EXISTS "DataServiceOrder" (
  "id"               TEXT NOT NULL,
  "reference"        TEXT NOT NULL,
  "serviceId"        TEXT,
  "serviceName"      TEXT NOT NULL,
  "variantId"        TEXT,
  "variantName"      TEXT NOT NULL,
  "speedLabel"       TEXT NOT NULL DEFAULT '',
  "speedFee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "turnaround"       TEXT NOT NULL DEFAULT '',
  "price"            DOUBLE PRECISION NOT NULL,
  "agentCost"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "customerName"     TEXT NOT NULL,
  "customerPhone"    TEXT NOT NULL,
  "customerEmail"    TEXT NOT NULL DEFAULT '',
  "answers"          TEXT NOT NULL DEFAULT '{}',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "paymentStatus"    TEXT NOT NULL DEFAULT 'unpaid',
  "paidAt"           TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "adminNote"        TEXT NOT NULL DEFAULT '',
  "agentId"          TEXT,
  "source"           TEXT NOT NULL DEFAULT 'WEB',
  "agentCommission"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionStatus" TEXT NOT NULL DEFAULT 'pending',
  "commissionPaidAt" TIMESTAMP(3),
  "userId"           TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataServiceOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataServiceOrder_serviceId_fkey" FOREIGN KEY ("serviceId")
    REFERENCES "DataService"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DataServiceOrder_variantId_fkey" FOREIGN KEY ("variantId")
    REFERENCES "DataServiceVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DataServiceOrder_agentId_fkey" FOREIGN KEY ("agentId")
    REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataServiceOrder_reference_key" ON "DataServiceOrder"("reference");
CREATE INDEX IF NOT EXISTS "DataServiceOrder_status_createdAt_idx" ON "DataServiceOrder"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataServiceOrder_customerPhone_idx" ON "DataServiceOrder"("customerPhone");
CREATE INDEX IF NOT EXISTS "DataServiceOrder_agentId_createdAt_idx" ON "DataServiceOrder"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataServiceOrder_serviceId_createdAt_idx" ON "DataServiceOrder"("serviceId", "createdAt");

CREATE TABLE IF NOT EXISTS "DataServiceDocument" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "fieldKey"  TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "fileName"  TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL DEFAULT '',
  "size"      INTEGER NOT NULL DEFAULT 0,
  "dataUrl"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataServiceDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataServiceDocument_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DataServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DataServiceDocument_orderId_idx" ON "DataServiceDocument"("orderId");
CREATE INDEX IF NOT EXISTS "DataServiceDocument_createdAt_idx" ON "DataServiceDocument"("createdAt");

CREATE TABLE IF NOT EXISTS "DataAgentServicePrice" (
  "id"        TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "price"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataAgentServicePrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataAgentServicePrice_agentId_fkey" FOREIGN KEY ("agentId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataAgentServicePrice_variantId_fkey" FOREIGN KEY ("variantId")
    REFERENCES "DataServiceVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentServicePrice_agentId_variantId_key"
  ON "DataAgentServicePrice"("agentId", "variantId");
CREATE INDEX IF NOT EXISTS "DataAgentServicePrice_agentId_idx" ON "DataAgentServicePrice"("agentId");

CREATE TABLE IF NOT EXISTS "DataAgentService" (
  "id"        TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "visible"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataAgentService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataAgentService_agentId_fkey" FOREIGN KEY ("agentId")
    REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataAgentService_serviceId_fkey" FOREIGN KEY ("serviceId")
    REFERENCES "DataService"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentService_agentId_serviceId_key"
  ON "DataAgentService"("agentId", "serviceId");
CREATE INDEX IF NOT EXISTS "DataAgentService_agentId_idx" ON "DataAgentService"("agentId");

CREATE TABLE IF NOT EXISTS "DataServiceDraft" (
  "id"            TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "serviceId"     TEXT,
  "variantId"     TEXT,
  "speedKey"      TEXT NOT NULL DEFAULT '',
  "customerName"  TEXT NOT NULL DEFAULT '',
  "customerPhone" TEXT NOT NULL DEFAULT '',
  "customerEmail" TEXT NOT NULL DEFAULT '',
  "answers"       TEXT NOT NULL DEFAULT '{}',
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataServiceDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataServiceDraft_serviceId_fkey" FOREIGN KEY ("serviceId")
    REFERENCES "DataService"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataServiceDraft_code_key" ON "DataServiceDraft"("code");
CREATE INDEX IF NOT EXISTS "DataServiceDraft_customerPhone_idx" ON "DataServiceDraft"("customerPhone");
CREATE INDEX IF NOT EXISTS "DataServiceDraft_expiresAt_idx" ON "DataServiceDraft"("expiresAt");

-- The agent's own flyer design, layered over the admin's house design, and the
-- switch that takes the whole shelf off one storefront.
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "serviceFlyerDesign" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "serviceFlyerTheme"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "servicesEnabled"    BOOLEAN NOT NULL DEFAULT true;
