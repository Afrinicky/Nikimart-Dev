-- Shipping, made simple enough to run a business on.
--
-- Two problems, one migration.
--
-- ## Inside Ghana: a fee that multiplied
--
-- The domestic leg was priced per line: base + per-kilogram, times the
-- quantity. So one bottle of spray at GH₵35 cost GH₵10 to deliver, and ten
-- bottles cost GH₵100 — for one parcel, on one van, to one station. No courier
-- prices like that and no buyer believes it.
--
-- The replacement is the shape a real courier quotes: a base fee for the
-- consignment, then a small increment for each additional unit. Crucially it is
-- charged **per seller**, because that is what a consignment actually is: goods
-- gathered from one shop and moved together. Ten bottles from one seller are
-- one base fee plus nine increments; two sellers are two consignments and two
-- base fees. Nothing else changes: collection at the point the goods already
-- sit at is still free.
--
-- ## From abroad: rates that live where the forwarder does
--
-- A forwarder does not have "a rate". CSL Imports has a rate for China → Accra
-- and another for China → Kumasi; each of those has a rate for normal goods,
-- for special goods and for heavy-duty goods; a fridge picks up an energy
-- commission levy per cubic metre and a carton of wigs an FDA one; sea is 35–45
-- days and air is 7–14. All of it is quoted in dollars, and when the cedi
-- moves, every one of those numbers moves with it.
--
-- None of that fitted in a flat list of "forwarder × our category → GH₵/CBM".
-- So the price list is now shaped like the forwarder's own quote sheet:
--
--   FreightForwarder
--     └── ForwarderGoodsClass   their classes: Normal, Special, Heavy-Duty…
--     └── ForwarderCategoryMap  our categories → their classes
--     └── ForwarderRoute        China → Accra, by sea, in USD, 35–45 days
--           └── ForwarderRouteRate   one price per goods class on that route
--
-- Rates are stored in the currency they were quoted in and converted at quote
-- time from the "Currency" table, so correcting the dollar rate re-prices every
-- listing that depends on it without touching a single rate row.
--
-- Additive only, per db/migrations/README.md. The old ForwarderRate table is
-- left exactly where it is and is still read as a legacy fallback for any
-- forwarder that has no routes yet — no backfill, no downtime, and a forwarder
-- keeps quoting until somebody moves it onto routes.

-- ---------------------------------------------------------------------------
-- Products: the minimum a buyer may order
-- ---------------------------------------------------------------------------
--
-- Wholesale and imported listings are rarely sold one at a time. A seller who
-- has to buy a carton of 12 needs to say so on the listing rather than in the
-- description where nothing enforces it.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "moq" INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Inside Ghana: the per-additional-unit increment
-- ---------------------------------------------------------------------------
--
-- The base fee column already exists and keeps its meaning: what one
-- consignment from one seller costs. This is what each unit after the first
-- adds. Left at zero, the engine falls back to the rule's weight rate (per
-- billable kilogram of one unit) and then to the platform default, so rules
-- written under the old system keep pricing sensibly with nothing rewritten.
ALTER TABLE "ShippingRule" ADD COLUMN IF NOT EXISTS "perUnitFee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Currencies
-- ---------------------------------------------------------------------------
--
-- Freight abroad is quoted in dollars far more often than in cedis. Storing the
-- converted cedi figure would mean re-typing every rate on the day the cedi
-- moves; storing the quoted figure and one exchange rate means correcting one
-- number. "rateToGhs" is what one unit of the currency is worth in GH₵.
CREATE TABLE IF NOT EXISTS "Currency" (
  "code"      TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL DEFAULT '',
  "symbol"    TEXT NOT NULL DEFAULT '',
  "rateToGhs" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Freight forwarders: the currency they quote in
-- ---------------------------------------------------------------------------
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GHS';
-- Free-text notes a forwarder attaches to their whole price list — the levies
-- and quirks that do not belong to any one route ("appliances carry a $10/CBM
-- energy commission fee"). Shown to admins and sellers, never priced from.
ALTER TABLE "FreightForwarder" ADD COLUMN IF NOT EXISTS "terms" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- The forwarder's own goods classes
-- ---------------------------------------------------------------------------
--
-- A forwarder's classes are not our categories and never will be. Ours are what
-- a shopper browses — Electronics, Fashion, Home. Theirs are what a container
-- is priced by: Normal, Special, Heavy-Duty. Each forwarder writes their own,
-- and our categories are mapped onto them.
--
-- "surchargePerCbm" is the levy that rides on a class regardless of route: the
-- energy commission on appliances, the FDA charge on diapers and wigs. It is in
-- the forwarder's own currency, like every other figure they quote.
CREATE TABLE IF NOT EXISTS "ForwarderGoodsClass" (
  "id"              TEXT PRIMARY KEY,
  "forwarderId"     TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "note"            TEXT NOT NULL DEFAULT '',
  "surchargePerCbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "surchargeLabel"  TEXT NOT NULL DEFAULT '',
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  -- The class a category with no mapping of its own falls into.
  "isDefault"       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "ForwarderGoodsClass_forwarderId_idx" ON "ForwarderGoodsClass"("forwarderId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderGoodsClass_name_key" ON "ForwarderGoodsClass"("forwarderId", "name");

DO $$
BEGIN
  ALTER TABLE "ForwarderGoodsClass"
    ADD CONSTRAINT "ForwarderGoodsClass_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Our category → their class. One row per category a forwarder has an opinion
-- about; everything else falls to their default class.
CREATE TABLE IF NOT EXISTS "ForwarderCategoryMap" (
  "id"           TEXT PRIMARY KEY,
  "forwarderId"  TEXT NOT NULL,
  "categoryId"   TEXT NOT NULL,
  "goodsClassId" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderCategoryMap_scope_key"
  ON "ForwarderCategoryMap"("forwarderId", "categoryId");
CREATE INDEX IF NOT EXISTS "ForwarderCategoryMap_goodsClassId_idx" ON "ForwarderCategoryMap"("goodsClassId");

DO $$
BEGIN
  ALTER TABLE "ForwarderCategoryMap"
    ADD CONSTRAINT "ForwarderCategoryMap_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ForwarderCategoryMap"
    ADD CONSTRAINT "ForwarderCategoryMap_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ForwarderCategoryMap"
    ADD CONSTRAINT "ForwarderCategoryMap_goodsClassId_fkey"
    FOREIGN KEY ("goodsClassId") REFERENCES "ForwarderGoodsClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Routes
-- ---------------------------------------------------------------------------
--
-- One lane a forwarder sells: where it collects, how it travels, which Ghana
-- consolidation point it lands at, what currency it is quoted in, and how long
-- it takes. A buyer picks between these at checkout, which is why the transit
-- window lives here and not in a settings field — sea and air out of the same
-- warehouse are 35–45 days and 7–14 days, and the buyer is choosing exactly
-- that trade.
CREATE TABLE IF NOT EXISTS "ForwarderRoute" (
  "id"                 TEXT PRIMARY KEY,
  "forwarderId"        TEXT NOT NULL,
  "name"               TEXT NOT NULL DEFAULT '',
  -- Where the load is collected: country code (CN, AE, US…) and, optionally,
  -- the city the forwarder's warehouse is in.
  "originCountry"      TEXT NOT NULL DEFAULT '',
  "originCity"         TEXT NOT NULL DEFAULT '',
  -- air | sea | road | express
  "mode"               TEXT NOT NULL DEFAULT 'sea',
  -- The Ghana consolidation point this lane lands at. A forwarder with depots
  -- in Accra, Kumasi and Sunyani has one route per depot per mode, and each of
  -- them has its own prices — which is exactly how they quote it.
  "destinationPointId" TEXT,
  -- The currency the rates on this route are typed in.
  "currency"           TEXT NOT NULL DEFAULT 'GHS',
  -- The transit window shown to the buyer: "35–45 days".
  "minDays"            INTEGER NOT NULL DEFAULT 21,
  "maxDays"            INTEGER NOT NULL DEFAULT 45,
  "note"               TEXT NOT NULL DEFAULT '',
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  -- The route a listing is quoted on before the buyer chooses one.
  "isDefault"          BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ForwarderRoute_forwarderId_idx" ON "ForwarderRoute"("forwarderId");
CREATE INDEX IF NOT EXISTS "ForwarderRoute_destinationPointId_idx" ON "ForwarderRoute"("destinationPointId");

DO $$
BEGIN
  ALTER TABLE "ForwarderRoute"
    ADD CONSTRAINT "ForwarderRoute_forwarderId_fkey"
    FOREIGN KEY ("forwarderId") REFERENCES "FreightForwarder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ForwarderRoute"
    ADD CONSTRAINT "ForwarderRoute_destinationPointId_fkey"
    FOREIGN KEY ("destinationPointId") REFERENCES "ArrivalPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One price on one route, for one of the forwarder's goods classes. The row
-- with no class is the route's catch-all.
--
-- "minCbm" is how a quote sheet says "Normal Goods <1 CBM — $260": anything
-- under a cubic metre is still billed as one. Without it, half a cubic metre of
-- normal goods would be quoted at $130 and the forwarder would invoice $260.
CREATE TABLE IF NOT EXISTS "ForwarderRouteRate" (
  "id"           TEXT PRIMARY KEY,
  "routeId"      TEXT NOT NULL,
  "goodsClassId" TEXT,
  "ratePerCbm"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratePerKg"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minCharge"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minCbm"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "ForwarderRouteRate_routeId_idx" ON "ForwarderRouteRate"("routeId");
CREATE INDEX IF NOT EXISTS "ForwarderRouteRate_goodsClassId_idx" ON "ForwarderRouteRate"("goodsClassId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderRouteRate_scope_key"
  ON "ForwarderRouteRate"("routeId", COALESCE("goodsClassId", ''));

DO $$
BEGIN
  ALTER TABLE "ForwarderRouteRate"
    ADD CONSTRAINT "ForwarderRouteRate_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "ForwarderRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ForwarderRouteRate"
    ADD CONSTRAINT "ForwarderRouteRate_goodsClassId_fkey"
    FOREIGN KEY ("goodsClassId") REFERENCES "ForwarderGoodsClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Order lines: the route the buyer chose
-- ---------------------------------------------------------------------------
--
-- Snapshotted like every other part of the bill. A buyer who paid for air
-- freight and a 7–14 day window must keep that record even if the seller later
-- moves the listing to sea.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "freightRouteId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "transitMinDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "transitMaxDays" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "OrderItem_freightRouteId_idx" ON "OrderItem"("freightRouteId");

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_freightRouteId_fkey"
    FOREIGN KEY ("freightRouteId") REFERENCES "ForwarderRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
