-- 0012 — one base fee per lane, and large goods priced by their size.
--
-- The domestic leg used to have a single base fee: one number, in settings,
-- for every journey on the platform. That number can only ever be right for
-- one of them. Nikimart's Sunyani pickup to Hwidiem, Accra to the Sunyani
-- station, CSL's Sunyani consolidation point to the Nikimart station in the
-- same town — three runs, three costs, one setting between them.
--
-- So the base fee becomes a grid: consolidation points down the side, pickup
-- stations across the top, and a cell for each pair. One row here is one cell.
-- A lane with no row falls through to the rules table and then to the platform
-- default, so nothing that priced before this migration prices differently
-- after it: the table starts empty and empty means "as you were".
--
-- The increments are deliberately untouched. What each item after the first
-- adds is still the rules table's `perUnitFee` and the platform default behind
-- it; this migration only ever concerns the *first* item.
--
-- The second half of the table is for goods a flat fee prices wrongly in the
-- other direction. A fridge, a chest freezer, a double oven: what they cost to
-- move is the space they take, not the fact that there is one of them. Those
-- are priced per cubic metre, per lane, with a floor under it — and when a
-- lane has not priced them, the platform figure applies, and when nothing has,
-- the flat base fee still does. A large item is never quoted at nothing
-- because somebody left a rate blank.

CREATE TABLE IF NOT EXISTS "ShippingLaneFee" (
  "id"              TEXT PRIMARY KEY,
  -- Both ends are required: a cell of a grid is never "anywhere".
  "originPointId"   TEXT NOT NULL,
  "destPickupId"    TEXT NOT NULL,
  -- What one consignment on this lane costs, before the increments. Nullable
  -- on purpose: NULL is "no base fee of its own here", which falls through to
  -- the rules table and the platform default, and zero is a lane quoted free.
  -- A cell that carries only a large-item rate needs to say the first without
  -- accidentally saying the second.
  "baseFee"         DOUBLE PRECISION,
  -- Large goods on this lane: GH₵ per cubic metre, and the floor under it.
  -- Zero = this lane has not priced them.
  "largeRatePerCbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "largeMinFee"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"            TEXT NOT NULL DEFAULT '',
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One cell per lane. Both columns are NOT NULL, so — unlike the rules table,
-- whose scope is full of nullable "any" columns — this is a plain unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingLaneFee_originPointId_destPickupId_key"
  ON "ShippingLaneFee"("originPointId", "destPickupId");
CREATE INDEX IF NOT EXISTS "ShippingLaneFee_destPickupId_idx"
  ON "ShippingLaneFee"("destPickupId");

DO $$
BEGIN
  ALTER TABLE "ShippingLaneFee"
    ADD CONSTRAINT "ShippingLaneFee_originPointId_fkey"
    FOREIGN KEY ("originPointId") REFERENCES "ArrivalPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShippingLaneFee"
    ADD CONSTRAINT "ShippingLaneFee_destPickupId_fkey"
    FOREIGN KEY ("destPickupId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
