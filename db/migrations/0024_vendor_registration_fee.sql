-- What it costs to open a shop.
--
-- Nickimart has always registered sellers for nothing, and the setting behind
-- these columns defaults to zero, so nothing changes until an admin sets a
-- price. What the columns are for is making a price that is charged
-- answerable later: the fee is snapshotted onto the shop when it registers, so
-- changing the price next month never rewrites what somebody already paid, and
-- a shop that registered before the fee existed carries zero and owes nothing.
--
-- Additive and idempotent, per db/migrations/README.md.

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "registrationFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "registrationPaidAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "registrationReference" TEXT;
