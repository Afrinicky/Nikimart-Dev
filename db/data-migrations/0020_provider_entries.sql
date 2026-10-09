-- Movements on the provider's wallet that an administrator declares.
--
-- A reading can only account for what the balance did between itself and the
-- reading before it. Money put into the wallet before readings began, and
-- money that netted off against a day's trading inside a single interval, are
-- invisible to that arithmetic and stay invisible however many readings
-- follow. They are also precisely the movements a reconciliation has to
-- account for, so they are entered by hand instead of inferred.
--
-- A separate table rather than a synthetic reading: a reading is a figure the
-- provider stated and this is one a person asserted, and a reconciliation
-- should not confuse the two. It also leaves the readings chain alone, each
-- link of which is arithmetic against the link before it.

CREATE TABLE IF NOT EXISTS "DataProviderEntry" (
  "id"             TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "occurredAt"     TIMESTAMP(3) NOT NULL,
  "note"           TEXT NOT NULL DEFAULT '',
  "createdById"    TEXT,
  "createdByEmail" TEXT NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataProviderEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataProviderEntry_occurredAt_idx"
  ON "DataProviderEntry"("occurredAt");

CREATE INDEX IF NOT EXISTS "DataProviderEntry_kind_occurredAt_idx"
  ON "DataProviderEntry"("kind", "occurredAt");
