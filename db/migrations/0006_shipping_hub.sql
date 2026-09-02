-- One shipping system, configured in one place.
--
-- Before this, a fee was assembled from three consoles: Shipping (a CBM matrix
-- between pickup points), Arrival points (where imports land, and what they
-- cost), and Settings (import duty, VAT, lead times). Nothing named the thing
-- they all turn on — the place goods gather before they are carried to a buyer
-- — so one real warehouse had to be modelled twice, once as a pickup point and
-- once as an arrival point, and a route could only be priced between the halves
-- that happened to be pickup points.
--
-- The consolidation point is that missing noun. It is where a consignment
-- gathers and is checked: a seller's Kumasi store, a supplier's Accra receiving
-- depot, Tema Port. It may sit at a pickup point, and when it does, a buyer
-- collecting there pays nothing — the goods are already in the room.
--
-- The domestic leg is also re-based. Cubic metres are how sea freight is sold
-- and not how a courier crossing Ghana is: a seller listing a blender had to
-- work out its volume in m³ to the fourth decimal before they could price it.
-- Inside Ghana this now works the way Jumia's does — billable weight, which is
-- the greater of what a parcel weighs and what its size says it weighs — while
-- CBM stays where it belongs, on the forwarder's leg from abroad.
--
-- Additive only, per db/migrations/README.md. "ArrivalPoint" keeps its name
-- because every listing, order line and shipment already points at it; the
-- application calls it a consolidation point (see src/lib/shipping.ts) and the
-- new "kind" column says whether it gathers local or imported goods.

-- ---------------------------------------------------------------------------
-- Consolidation points
-- ---------------------------------------------------------------------------

-- 'local'         — goods that never left Ghana gather here.
-- 'international' — imported consignments land and clear here.
-- Existing rows are all import landing points, which is the default.
ALTER TABLE "ArrivalPoint" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'international';

-- ---------------------------------------------------------------------------
-- Shipping rules: what the domestic leg costs.
-- ---------------------------------------------------------------------------
--
-- One table, because an admin should not have to learn two. A rule is a scope
-- and a price. The scope is any combination of "from this consolidation point",
-- "to this pickup point" and "for this category", and every part of it is
-- optional — a rule with none set is the fallback that prices everything else.
-- The price is either a flat fee per item ("blenders, Kumasi to Accra, GH₵50")
-- or a base plus a per-kilogram rate on the billable weight.
--
-- Rules are resolved most-specific-first in the application, so the general
-- case can be written once and refined afterwards without a rewrite. Scope
-- uniqueness is enforced on the COALESCE'd columns: NULL never equals NULL in
-- Postgres, so a plain unique index would let the same scope be stored twice
-- and leave the resolver picking between them arbitrarily.
CREATE TABLE IF NOT EXISTS "ShippingRule" (
  "id"            TEXT PRIMARY KEY,
  -- NULL on any of the three = "any". All three NULL = the platform fallback.
  "originPointId" TEXT,
  "destPickupId"  TEXT,
  "categoryId"    TEXT,
  -- A flat fee per item, in GH₵. When set above zero, weight is not consulted:
  -- this is the "all blenders from Kumasi to Accra cost 50" rule.
  "flatFee"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Otherwise: a fee per consignment plus a rate per billable kilogram.
  "baseFee"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "perKgRate"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"          TEXT NOT NULL DEFAULT '',
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShippingRule_scope_key"
  ON "ShippingRule"(COALESCE("originPointId", ''), COALESCE("destPickupId", ''), COALESCE("categoryId", ''));
CREATE INDEX IF NOT EXISTS "ShippingRule_originPointId_idx" ON "ShippingRule"("originPointId");
CREATE INDEX IF NOT EXISTS "ShippingRule_destPickupId_idx" ON "ShippingRule"("destPickupId");
CREATE INDEX IF NOT EXISTS "ShippingRule_categoryId_idx" ON "ShippingRule"("categoryId");

DO $$
BEGIN
  ALTER TABLE "ShippingRule"
    ADD CONSTRAINT "ShippingRule_originPointId_fkey"
    FOREIGN KEY ("originPointId") REFERENCES "ArrivalPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShippingRule"
    ADD CONSTRAINT "ShippingRule_destPickupId_fkey"
    FOREIGN KEY ("destPickupId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShippingRule"
    ADD CONSTRAINT "ShippingRule_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Freight forwarders and their CBM price lists.
-- ---------------------------------------------------------------------------
--
-- The second way goods come in: the supplier only delivers to a forwarder in
-- their own country, and the forwarder consolidates and carries the load to
-- Ghana. What they quote is a rate per cubic metre that already contains the
-- carriage, the port fees, the duty and the taxes up to their Ghana
-- consolidation point — which is why "allInclusive" defaults to true and duty
-- is not then assessed a second time on top of it.
CREATE TABLE IF NOT EXISTS "FreightForwarder" (
  "id"                   TEXT PRIMARY KEY,
  "name"                 TEXT NOT NULL,
  "code"                 TEXT NOT NULL,
  -- Country the forwarder collects in: CN, AE, US, EU…
  "originCountry"        TEXT NOT NULL DEFAULT '',
  -- The Ghana consolidation point they deliver into.
  "consolidationPointId" TEXT,
  -- air | sea | road | express
  "mode"                 TEXT NOT NULL DEFAULT 'sea',
  -- True when the CBM price covers port fees, duty and taxes to that point.
  "allInclusive"         BOOLEAN NOT NULL DEFAULT true,
  "note"                 TEXT NOT NULL DEFAULT '',
  "isActive"             BOOLEAN NOT NULL DEFAULT true,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "FreightForwarder_code_key" ON "FreightForwarder"("code");
CREATE INDEX IF NOT EXISTS "FreightForwarder_consolidationPointId_idx" ON "FreightForwarder"("consolidationPointId");

DO $$
BEGIN
  ALTER TABLE "FreightForwarder"
    ADD CONSTRAINT "FreightForwarder_consolidationPointId_fkey"
    FOREIGN KEY ("consolidationPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One forwarder, several prices. A forwarder who charges one rate per cubic
-- metre for clothing and another for electronics is ordinary, so the price list
-- is keyed on the product category; the row with no category is the one
-- everything else falls back to.
CREATE TABLE IF NOT EXISTS "ForwarderRate" (
  "id"          TEXT PRIMARY KEY,
  "forwarderId" TEXT NOT NULL,
  -- NULL = the catch-all price for categories with no row of their own.
  "categoryId"  TEXT,
  "label"       TEXT NOT NULL DEFAULT '',
  "ratePerCbm"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratePerKg"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minCharge"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "transitDays" INTEGER NOT NULL DEFAULT 21
);

CREATE INDEX IF NOT EXISTS "ForwarderRate_forwarderId_idx" ON "ForwarderRate"("forwarderId");
CREATE INDEX IF NOT EXISTS "ForwarderRate_categoryId_idx" ON "ForwarderRate"("categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderRate_scope_key"
  ON "ForwarderRate"("forwarderId", COALESCE("categoryId", ''));

DO $$
BEGIN
  ALTER TABLE "ForwarderRate"
    ADD CONSTRAINT "ForwarderRate_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ForwarderRate"
    ADD CONSTRAINT "ForwarderRate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Product: how this listing is shipped.
-- ---------------------------------------------------------------------------

-- 'auto'   — priced by the rules above (almost everything).
-- 'free'   — the seller absorbs it; no fee to any pickup point.
-- 'manual' — the fee is typed in. Cars, sensitive goods, anything a rate table
--            would price wrongly: a special shipment, quoted by hand.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shippingMethod"    TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "manualShippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- True when the supplier's price already puts the goods at the Ghana
-- consolidation point. Nothing is charged for the international leg; the buyer
-- pays only the local run from that point to the pickup station they choose.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierDelivers"  BOOLEAN NOT NULL DEFAULT false;
-- The forwarder carrying the international leg, when one does.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "forwarderId"       TEXT;
-- Whether the seller lets a buyer settle the shipping when they collect. The
-- goods are always paid for at checkout — they are spent the moment the seller
-- fulfils the order — but the courier run has not happened yet, and a seller
-- who is willing to carry that gap may say so per listing.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shippingOnPickup"  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Product_forwarderId_idx" ON "Product"("forwarderId");

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Vendor: the shop's default consolidation point.
-- ---------------------------------------------------------------------------
--
-- Set once per shop so a seller listing their tenth product does not have to
-- answer "where do your goods gather?" for the tenth time. A listing may still
-- override it. "originPickupId" stays as the older fallback.
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "consolidationPointId" TEXT;

CREATE INDEX IF NOT EXISTS "Vendor_consolidationPointId_idx" ON "Vendor"("consolidationPointId");

DO $$
BEGIN
  ALTER TABLE "Vendor"
    ADD CONSTRAINT "Vendor_consolidationPointId_fkey"
    FOREIGN KEY ("consolidationPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- OrderItem: the shipping figure the buyer actually saw.
-- ---------------------------------------------------------------------------
--
-- The itemised columns (freight legs, duty, clearing, tax) stay for the seller
-- payout and the finance reports. This is the single number the buyer was
-- shown and agreed to, snapshotted so a later rate change cannot rewrite it.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "shippingFee"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "shippingMethod" TEXT NOT NULL DEFAULT 'auto';
-- True when this line's shipping was left to be settled at collection.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "shippingDeferred" BOOLEAN NOT NULL DEFAULT false;
-- The consolidation point this line's goods gather at, snapshotted.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "consolidationPointId" TEXT;

CREATE INDEX IF NOT EXISTS "OrderItem_consolidationPointId_idx" ON "OrderItem"("consolidationPointId");

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_consolidationPointId_fkey"
    FOREIGN KEY ("consolidationPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
