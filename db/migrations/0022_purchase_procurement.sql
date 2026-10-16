-- 0022 — what a purchase has to survive.
--
-- A purchase record said only that an admin had pressed a button: a
-- reference, a supplier name, a total in cedis, a note. The case it could not
-- answer is the one that costs money — the supplier who took payment and
-- never shipped. Reconstructing that claim afterwards needs what was paid, in
-- what currency, through which channel, against which invoice, and what was
-- promised in writing, and none of it was anywhere.
--
-- So: the paperwork hangs off the purchase as links rather than uploads (the
-- documents already live in a drive or an inbox, and a copy that drifts from
-- the original is worse than a pointer), and the payments are rows rather
-- than a column, because a supplier is rarely paid once. A deposit to start
-- the order, a balance before it ships, a freight charge on top — three
-- different days, three channels, three references, and a claim is assembled
-- out of exactly those facts, per payment.

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierOrderNo"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "fxRate"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierCost"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "amountPaid"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceUrl"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "receiptUrl"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "agreementUrl"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "documents"        TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierTracking" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierCarrier"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "expectedAt"       TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "disputeStatus"    TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "disputeNote"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "disputeAt"        TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PurchaseOrder_disputeStatus_idx" ON "PurchaseOrder"("disputeStatus");

CREATE TABLE IF NOT EXISTS "PurchasePayment" (
  "id"           TEXT NOT NULL,
  "purchaseId"   TEXT NOT NULL,
  -- In the purchase's own currency, and what actually left the account in GH₵
  -- at the rate of the day. Snapshotted, so a later FX move cannot rewrite
  -- what was spent.
  "amount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency"     TEXT NOT NULL DEFAULT '',
  "amountGhs"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- momo | bank | card | cash | crypto | other
  "method"       TEXT NOT NULL DEFAULT '',
  -- The transfer id or MoMo reference — what can be quoted to a bank.
  "reference"    TEXT NOT NULL DEFAULT '',
  -- deposit | balance | freight | refund | other
  "kind"         TEXT NOT NULL DEFAULT 'deposit',
  "receiptUrl"   TEXT NOT NULL DEFAULT '',
  "note"         TEXT NOT NULL DEFAULT '',
  "paidAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchasePayment_purchaseId_paidAt_idx"
  ON "PurchasePayment"("purchaseId", "paidAt");

DO $$ BEGIN
  ALTER TABLE "PurchasePayment"
    ADD CONSTRAINT "PurchasePayment_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PurchasePayment"
    ADD CONSTRAINT "PurchasePayment_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Everything bought before this migration was paid for somehow; the record of
-- how is gone, but the total is not. Seeding amountPaid from totalCost on the
-- purchases that were actually placed keeps the "outstanding to suppliers"
-- figure honest from day one rather than reporting every historical purchase
-- as unpaid.
UPDATE "PurchaseOrder"
   SET "amountPaid" = "totalCost"
 WHERE "status" IN ('placed', 'received') AND "amountPaid" = 0;
