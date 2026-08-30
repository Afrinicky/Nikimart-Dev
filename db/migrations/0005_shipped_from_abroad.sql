-- Shipped from Abroad — the dropshipping system that replaces preorders.
--
-- A seller finds an item abroad (Alibaba, 1688, Amazon), copies its details and
-- link, and lists it here. It is then bought, taxed at source, carried to a
-- freight forwarder, flown or shipped to a Ghana arrival point, dutied and
-- taxed on landing, and finally moved to the buyer's pickup point. Three
-- freight legs, two tax jurisdictions, and a buyer who may pay for all of it
-- now or only the part that is already spent.
--
-- Additive only, per db/migrations/README.md. Nothing is renamed and nothing is
-- backfilled: listings created as productType='preorder' keep that value, and
-- the application treats it as a synonym for 'shipped_from_abroad'
-- (see src/lib/abroad.ts). Their terms stay in Product.preorderInfo, which the
-- new parser reads as a legacy shape.

-- ---------------------------------------------------------------------------
-- Ghana arrival points: where goods from abroad land before the domestic leg.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ArrivalPoint" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "city"        TEXT NOT NULL DEFAULT '',
  "address"     TEXT NOT NULL DEFAULT '',
  "dutyPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "clearingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"        TEXT NOT NULL DEFAULT '',
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hubPickupId" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArrivalPoint_code_key" ON "ArrivalPoint"("code");
CREATE INDEX IF NOT EXISTS "ArrivalPoint_hubPickupId_idx" ON "ArrivalPoint"("hubPickupId");

DO $$
BEGIN
  ALTER TABLE "ArrivalPoint"
    ADD CONSTRAINT "ArrivalPoint_hubPickupId_fkey"
    FOREIGN KEY ("hubPickupId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Per-origin, per-mode rates into an arrival point. Air is sold by the kilo and
-- sea by the cubic metre, so a row may carry both; minCharge floors the sum.
CREATE TABLE IF NOT EXISTS "ArrivalRate" (
  "id"             TEXT PRIMARY KEY,
  "arrivalPointId" TEXT NOT NULL,
  "originCountry"  TEXT NOT NULL DEFAULT '*',
  "mode"           TEXT NOT NULL DEFAULT 'sea',
  "ratePerCbm"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratePerKg"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minCharge"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "transitDays"    INTEGER NOT NULL DEFAULT 21
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArrivalRate_point_origin_mode_key"
  ON "ArrivalRate"("arrivalPointId", "originCountry", "mode");
CREATE INDEX IF NOT EXISTS "ArrivalRate_arrivalPointId_idx" ON "ArrivalRate"("arrivalPointId");

DO $$
BEGIN
  ALTER TABLE "ArrivalRate"
    ADD CONSTRAINT "ArrivalRate_arrivalPointId_fkey"
    FOREIGN KEY ("arrivalPointId") REFERENCES "ArrivalPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Product: the listing's own origin, its supplier, and its freight setup.
-- ---------------------------------------------------------------------------

-- originCountry here is the *listing's*, not the shop's. A seller in Accra
-- dropshipping from Guangzhou has a GH vendor and a CN product; origin used to
-- come from the vendor alone, so every such listing priced as domestic. Blank
-- falls back to the vendor's own originCountry, which is the old behaviour.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "originCountry"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourceUrl"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierName"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "freightMode"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierFreight" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "intlFreight"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "freightIncluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "originTaxRate"   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ghanaTaxRate"    DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "arrivalPointId"  TEXT;

CREATE INDEX IF NOT EXISTS "Product_arrivalPointId_idx" ON "Product"("arrivalPointId");

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_arrivalPointId_fkey"
    FOREIGN KEY ("arrivalPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Order: the landed-cost bill, and which half of it was paid today.
-- ---------------------------------------------------------------------------

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "hasAbroadItems"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "originTax"            DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "supplierFreight"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "internationalFreight" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "importDuty"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clearingFee"          DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ghanaTax"             DOUBLE PRECISION NOT NULL DEFAULT 0;
-- "full" | "goods_only". Under goods_only the freight legs, duty and Ghana tax
-- are settled when the item lands — and any rate rise in between is the buyer's.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentPlan"          TEXT NOT NULL DEFAULT 'full';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "amountPaid"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "balanceDue"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "freightLocked"        BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- OrderItem: the same bill, per line. A cart can mix an imported item with a
-- local one, and a seller payout must not be computed off freight the seller
-- never charged.
-- ---------------------------------------------------------------------------

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "originTax"            DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "supplierFreight"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "internationalFreight" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "importDuty"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "clearingFee"          DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "ghanaTax"             DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "domesticFreight"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "freightMode"          TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "freightIncluded"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "arrivalPointId"       TEXT;

CREATE INDEX IF NOT EXISTS "OrderItem_arrivalPointId_idx" ON "OrderItem"("arrivalPointId");

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_arrivalPointId_fkey"
    FOREIGN KEY ("arrivalPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Shipment: the two extra milestones an imported consignment passes.
-- ---------------------------------------------------------------------------

-- A domestic order goes prepared → in transit → out for delivery → delivered.
-- An imported one spends weeks between "the seller has ordered it" and "it is
-- in the country", and a buyer who cannot see that stretch assumes nothing is
-- happening. arrivedGhanaAt is the milestone the buyer is alerted on.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "forwarderReceivedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "arrivedGhanaAt"      TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "arrivalPointId"      TEXT;

CREATE INDEX IF NOT EXISTS "Shipment_arrivalPointId_idx" ON "Shipment"("arrivalPointId");

DO $$
BEGIN
  ALTER TABLE "Shipment"
    ADD CONSTRAINT "Shipment_arrivalPointId_fkey"
    FOREIGN KEY ("arrivalPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
