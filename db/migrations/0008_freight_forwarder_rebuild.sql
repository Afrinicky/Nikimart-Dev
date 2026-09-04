-- The freight forwarder, rebuilt around the way one actually quotes.
--
-- What was here before spread a forwarder across four screens and priced their
-- work with the platform's own numbers on top: a duty percentage, a VAT rate, a
-- clearing fee and a fallback rate per cubic metre. A forwarder's quote sheet
-- already contains all of that. Charging it again is double-billing, and
-- keeping a platform default beside it means two numbers that disagree.
--
-- So one forwarder now holds everything about themselves:
--
--   FreightForwarder            who they are, where they collect, where their
--                               Ghana address is, what currency they quote in
--     └── ArrivalPoint          their own consolidation points in Ghana. No
--         (forwarderId)         other forwarder may use one.
--     └── ForwarderGoodsClass   their classes of goods — the grid's rows
--     └── ForwarderRoute        one mode into one of their points — a column
--           └── ForwarderRouteRate   the cell: a rate per CBM, or not applicable
--     └── ForwarderCategoryMap  our categories placed in their classes
--
-- Additive only, per db/migrations/README.md. The columns and tables this
-- replaces (ForwarderRate, ArrivalRate, the duty and tax columns) are left
-- exactly where they are and simply stop being read.

-- ---------------------------------------------------------------------------
-- The forwarder
-- ---------------------------------------------------------------------------

-- Where they are reachable in Ghana, and who to call.
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "ghanaAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "contactName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT NOT NULL DEFAULT '';

-- The warehouse in the country of collection: where a supplier dispatches the
-- goods to before they are consolidated and sent to Ghana. Sellers are shown
-- this address, so it is part of the forwarder's record rather than a note.
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "collectionAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "collectionCity" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Consolidation points belong to a forwarder
-- ---------------------------------------------------------------------------
--
-- An international consolidation point is a forwarder's own warehouse. Two
-- forwarders sharing one was always a fiction, and it is what let a seller pick
-- a landing point nobody was carrying goods to. A point with a forwarder is
-- theirs; a point without one is a NikiMart local point.
ALTER TABLE "ArrivalPoint" ADD COLUMN IF NOT EXISTS "forwarderId" TEXT;

CREATE INDEX IF NOT EXISTS "ArrivalPoint_forwarderId_idx" ON "ArrivalPoint"("forwarderId");

DO $$
BEGIN
  ALTER TABLE "ArrivalPoint"
    ADD CONSTRAINT "ArrivalPoint_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Goods classes: a levy measured in cubic metres
-- ---------------------------------------------------------------------------
--
-- A forwarder's special levy is not a second price — it is volume added to the
-- consignment before their rate is applied ("wigs bill at an extra 0.05 CBM").
-- Expressing it that way means one currency, one rate and one multiplication.
ALTER TABLE "ForwarderGoodsClass" ADD COLUMN IF NOT EXISTS "levyCbm" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ForwarderGoodsClass" ADD COLUMN IF NOT EXISTS "levyLabel" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Routes: one mode into one of the forwarder's points
-- ---------------------------------------------------------------------------

-- The smallest consignment this lane accepts. Nothing under it ships, which is
-- why goods wait at the supplier until enough orders share a parcel — see the
-- order-placement queue.
ALTER TABLE "ForwarderRoute" ADD COLUMN IF NOT EXISTS "minCbm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- How often purchases are actually placed on this lane: weekly, monthly, or on
-- named days. Internal — buyers never see it.
ALTER TABLE "ForwarderRoute" ADD COLUMN IF NOT EXISTS "orderFrequency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ForwarderRoute" ADD COLUMN IF NOT EXISTS "orderFrequencyDetail" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Rates: a cell in the grid, which may be "not applicable"
-- ---------------------------------------------------------------------------
--
-- Not every class travels on every lane — air freight out of Guangzhou may take
-- phones and nothing else. A missing row used to mean "fall back to the
-- catch-all"; this says "this lane does not carry this class" out loud, so the
-- listing form can refuse it instead of quoting a price that does not exist.
ALTER TABLE "ForwarderRouteRate" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Products: the lane and the supplier
-- ---------------------------------------------------------------------------

-- The lane the seller chose at listing time: forwarder, consolidation point and
-- mode in one reference. Quoting hung off "the forwarder's default route"
-- before, which is not a choice the seller ever made.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "forwarderRouteId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_forwarderRouteId_idx" ON "Product"("forwarderRouteId");

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_forwarderRouteId_fkey"
    FOREIGN KEY ("forwarderRouteId") REFERENCES "ForwarderRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Who to buy from, and how to reach them. The link and the name already exist;
-- this is the phone number, WeChat handle or email the buyer is contacted on.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierContact" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Order placement
-- ---------------------------------------------------------------------------
--
-- Nothing told anybody when it was time to buy. An imported line sits paid-for
-- until enough volume from the same supplier clears the forwarder's minimum,
-- and only then is the purchase worth making — one parcel, one consolidation,
-- one freight bill. This is the record of that purchase.
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id"              TEXT PRIMARY KEY,
  "reference"       TEXT NOT NULL,
  -- Who it is bought from, copied off the listings at placement time so the
  -- record survives a seller editing the listing afterwards.
  "supplierName"    TEXT NOT NULL DEFAULT '',
  "supplierUrl"     TEXT NOT NULL DEFAULT '',
  "supplierContact" TEXT NOT NULL DEFAULT '',
  "vendorId"        TEXT,
  "forwarderId"     TEXT,
  "routeId"         TEXT,
  -- pending | placed | received | cancelled
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "totalCbm"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalCost"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"            TEXT NOT NULL DEFAULT '',
  "placedAt"        TIMESTAMP(3),
  "placedById"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_reference_key" ON "PurchaseOrder"("reference");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_forwarderId_idx" ON "PurchaseOrder"("forwarderId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_routeId_idx" ON "PurchaseOrder"("routeId");

DO $$
BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "ForwarderRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_placedById_fkey"
    FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The customer lines this purchase covers. One line belongs to at most one
-- purchase, which is what makes "still to be bought" a query rather than a
-- judgement call.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_purchaseOrderId_idx" ON "OrderItem"("purchaseOrderId");

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
