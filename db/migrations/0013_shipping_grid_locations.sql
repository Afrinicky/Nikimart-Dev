-- 0013 — the grid prices every journey, between any two locations.
--
-- 0012 gave the base fee a grid, but only half a one: consolidation points down
-- the side and pickup stations across the top. Those are two different lists,
-- so the table was not square. Accra Circle was a column and never a row; a
-- forwarder's Sunyani depot was a row and never a column. A run between two
-- places you could both see on the screen could not be priced.
--
-- The fix is to stop treating "somewhere goods gather" and "somewhere buyers
-- collect" as different kinds of thing. They are roles a place plays, and one
-- building usually plays both — Nikimart's Sunyani pickup is a station buyers
-- collect at and the point sellers consolidate at. So both ends of a lane now
-- address a *location*, which is either a pickup station or a consolidation
-- point that sits at no station (a forwarder's warehouse, most often). A
-- consolidation point that does sit at a station *is* that station, which is
-- what stops one building appearing twice in the grid with two prices.
--
-- That is why each end is a pair of nullable foreign keys rather than one
-- column: exactly one of each pair is set, and uniqueness is a COALESCE index,
-- the same trick the old rules table used, because NULL never equals NULL.
--
-- The increment moves into the cell too. What each item after the first adds
-- was the last thing still living in the rules table, and leaving it there
-- meant one journey was priced from two screens that could disagree. Both
-- numbers are nullable: NULL is "nothing to say here", which falls back to the
-- platform default, and zero is a decision — free, or no increment at all.
--
-- Rows written by 0012 keep working untouched: origin in "originPointId",
-- destination in "destPickupId" is still a valid shape, and the application
-- folds a point that sits at a station onto that station's identity as it
-- reads.

ALTER TABLE "ShippingLaneFee" ADD COLUMN IF NOT EXISTS "originPickupId" TEXT;
ALTER TABLE "ShippingLaneFee" ADD COLUMN IF NOT EXISTS "destPointId"    TEXT;
ALTER TABLE "ShippingLaneFee" ADD COLUMN IF NOT EXISTS "perUnitFee"     DOUBLE PRECISION;

-- Both ends were NOT NULL when only one shape of lane existed.
ALTER TABLE "ShippingLaneFee" ALTER COLUMN "originPointId" DROP NOT NULL;
ALTER TABLE "ShippingLaneFee" ALTER COLUMN "destPickupId"  DROP NOT NULL;

-- The old two-column unique index cannot express the four-column identity, and
-- with nullable columns it would let the same journey be stored twice.
DROP INDEX IF EXISTS "ShippingLaneFee_originPointId_destPickupId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ShippingLaneFee_lane_key"
  ON "ShippingLaneFee"(
    COALESCE("originPickupId", ''),
    COALESCE("originPointId", ''),
    COALESCE("destPickupId", ''),
    COALESCE("destPointId", '')
  );
CREATE INDEX IF NOT EXISTS "ShippingLaneFee_originPickupId_idx" ON "ShippingLaneFee"("originPickupId");
CREATE INDEX IF NOT EXISTS "ShippingLaneFee_destPointId_idx" ON "ShippingLaneFee"("destPointId");

DO $$
BEGIN
  ALTER TABLE "ShippingLaneFee"
    ADD CONSTRAINT "ShippingLaneFee_originPickupId_fkey"
    FOREIGN KEY ("originPickupId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShippingLaneFee"
    ADD CONSTRAINT "ShippingLaneFee_destPointId_fkey"
    FOREIGN KEY ("destPointId") REFERENCES "ArrivalPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- "ShippingRule" is not dropped. The application no longer reads it — the grid
-- is the only thing that prices a run inside Ghana — but migrations here are
-- additive by rule, and a table nobody queries costs nothing to leave standing
-- while the numbers in it are still worth reading back.
