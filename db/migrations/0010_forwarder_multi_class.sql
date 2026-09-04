-- 0010 — a category may fall into more than one of a forwarder's classes.
--
-- A fridge is a normal good *and* an appliance, and a forwarder charges for
-- both: $285 a cubic metre for the goods, $10 on top because it is an
-- appliance. The old unique index allowed exactly one class per category, so
-- an admin had to pick one rate and lose the other.
--
-- Rates now add up (see resolveLaneRate in src/lib/shipping.ts), and the
-- special-levy columns on ForwarderGoodsClass stop being read: a levy is a row
-- of the grid with a rate in it, not extra cubic metres bolted onto the volume.
-- Those columns are left in place — dropping one is a deliberate exercise, not
-- a deploy.
--
-- The index swap is the one thing here that is not additive, and it cannot be:
-- a unique constraint that forbids the second row is exactly what is being
-- removed. It is safe across a rolling deploy — the wider index still enforces
-- everything the narrower one did except the restriction we are lifting, and
-- code that writes one row per category keeps working untouched.

-- The name 0007 created, and the name Prisma would have chosen. Whichever this
-- database has, it goes.
DROP INDEX IF EXISTS "ForwarderCategoryMap_scope_key";
DROP INDEX IF EXISTS "ForwarderCategoryMap_forwarderId_categoryId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderCategoryMap_scope_key"
  ON "ForwarderCategoryMap"("forwarderId", "categoryId", "goodsClassId");

-- Looking a category's classes up is now a range read, not a point read.
CREATE INDEX IF NOT EXISTS "ForwarderCategoryMap_forwarderId_categoryId_idx"
  ON "ForwarderCategoryMap"("forwarderId", "categoryId");
