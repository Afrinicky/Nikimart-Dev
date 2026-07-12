-- NikiMart — Phase 10: automatic order tracking (incremental, additive, safe).
-- Run ONCE in your Neon SQL Editor. Adds one column used to pin manually-set
-- shipment statuses so automatic progression leaves them alone. Non-destructive.
BEGIN;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "manualHold" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,
       '76fa8103b605b0c024b046544a704e5c77a6d189602be1f5089017d3826ee5b3',
       now(), '20260712150346_shipment_manual_hold', now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" LIKE '%shipment_manual_hold'
);

COMMIT;
