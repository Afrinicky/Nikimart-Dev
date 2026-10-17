-- 0026 — a parcel nobody can walk off with.
--
-- Collection used to be a button. Anybody who could name an order number at
-- the counter could have a stranger's goods, and afterwards there was nothing
-- on record to say who had taken them. For a platform whose customers pay for
-- imported goods six weeks before they land, that was the weakest link in the
-- whole chain.
--
-- A parcel ready for collection now gets a one-time code, texted to the buyer,
-- and the counter cannot mark it collected without it. The code is stored as a
-- digest so reading the database does not read the codes, and guessing is
-- bounded the way a sign-in is.
--
-- The second half is the record. Somebody's brother collecting on their behalf
-- is normal here, and refusing it outright would only mean codes passed around
-- by phone. So the hand-over is witnessed instead — name, number and ID of
-- whoever actually took it — and a dispute has an answer.

CREATE TABLE IF NOT EXISTS "PickupCollection" (
  "id"                TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "pickupPointId"     TEXT,

  -- The code: a digest, never the code itself, plus what the operator may be
  -- told about it ("ends 42") when a buyer says they lost the text.
  "codeHash"          TEXT NOT NULL DEFAULT '',
  "codeHint"          TEXT NOT NULL DEFAULT '',
  "codeSentAt"        TIMESTAMP(3),
  "issued"            INTEGER NOT NULL DEFAULT 0,
  "attempts"          INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"       TIMESTAMP(3),

  -- The hand-over.
  "collectedAt"       TIMESTAMP(3),
  -- code | override
  "method"            TEXT NOT NULL DEFAULT '',
  "collectorName"     TEXT NOT NULL DEFAULT '',
  "collectorPhone"    TEXT NOT NULL DEFAULT '',
  "collectorIdType"   TEXT NOT NULL DEFAULT '',
  "collectorIdNumber" TEXT NOT NULL DEFAULT '',
  "collectorRelation" TEXT NOT NULL DEFAULT 'buyer',
  "overrideReason"    TEXT NOT NULL DEFAULT '',

  "releasedById"      TEXT,
  "releasedByName"    TEXT NOT NULL DEFAULT '',

  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PickupCollection_orderId_key" ON "PickupCollection"("orderId");
CREATE INDEX IF NOT EXISTS "PickupCollection_pickupPointId_idx" ON "PickupCollection"("pickupPointId");
CREATE INDEX IF NOT EXISTS "PickupCollection_collectedAt_idx" ON "PickupCollection"("collectedAt");

DO $$ BEGIN
  ALTER TABLE "PickupCollection"
    ADD CONSTRAINT "PickupCollection_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PickupCollection"
    ADD CONSTRAINT "PickupCollection_pickupPointId_fkey"
    FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PickupCollection"
    ADD CONSTRAINT "PickupCollection_releasedById_fkey"
    FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
