-- 0031 — Refunds, written down.
--
-- A refund used to be two unrelated things wearing one name. On a queued
-- order it credited the agent's wallet and left a ledger row. On a failed one
-- it flipped the status to "refunded", voided the commissions and moved no
-- money at all — so the button read the same, reported success the same, and
-- the agent's balance never changed. That is the whole of the reported bug.
--
-- It also left nowhere to look. A wallet credit is traceable through
-- DataAgentLedger, but a refund the buyer is owed on MoMo has no ledger row by
-- definition: the money leaves by hand, exactly like a withdrawal. So refunds
-- get a table of their own — one row per refund, whichever way the money went,
-- with who asked for it, where it was sent and whether it has actually landed.

CREATE TABLE IF NOT EXISTS "DataOrderRefund" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  -- The selling agent, where there was one. Null on a house (WEB) order.
  "agentId"   TEXT,
  -- Always the full amount the buyer paid for the order.
  "amount"    DOUBLE PRECISION NOT NULL,
  -- WALLET  — credited to the selling agent's Nickimart wallet.
  -- BUYER_MOMO — to be sent to the buyer's mobile money by hand.
  "destination" TEXT NOT NULL DEFAULT 'WALLET',
  -- settled | pending. A wallet credit settles the instant it is written;
  -- a MoMo refund waits on a person making the transfer.
  "status"    TEXT NOT NULL DEFAULT 'settled',
  -- Where a MoMo refund is going, snapshotted so a later edit to the order
  -- never rewrites what was actually sent.
  "momoPhone"   TEXT NOT NULL DEFAULT '',
  "momoName"    TEXT NOT NULL DEFAULT '',
  "momoNetwork" TEXT NOT NULL DEFAULT '',
  -- admin | agent, and their name, for the row to answer for itself.
  "requestedBy"     TEXT NOT NULL DEFAULT 'admin',
  "requestedByName" TEXT NOT NULL DEFAULT '',
  "note"            TEXT NOT NULL DEFAULT '',
  -- Who made the MoMo transfer, and when.
  "paidBy"    TEXT,
  "paidAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataOrderRefund_pkey" PRIMARY KEY ("id")
);

-- One refund per order, enforced here rather than in the form. Two admins on
-- the same row must not pay the same money back twice, and the status flip on
-- the order is not enough on its own: a MoMo refund leaves the order refunded
-- while the transfer is still outstanding.
CREATE UNIQUE INDEX IF NOT EXISTS "DataOrderRefund_orderId_key"
  ON "DataOrderRefund"("orderId");

CREATE INDEX IF NOT EXISTS "DataOrderRefund_status_createdAt_idx"
  ON "DataOrderRefund"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataOrderRefund_destination_createdAt_idx"
  ON "DataOrderRefund"("destination", "createdAt");
CREATE INDEX IF NOT EXISTS "DataOrderRefund_agentId_createdAt_idx"
  ON "DataOrderRefund"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataOrderRefund_reference_idx"
  ON "DataOrderRefund"("reference");

DO $$
BEGIN
  ALTER TABLE "DataOrderRefund"
    ADD CONSTRAINT "DataOrderRefund_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DataOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DataOrderRefund"
    ADD CONSTRAINT "DataOrderRefund_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Which number a re-credit sent the bundle to instead, kept on the order so
-- "cancel and send to another number" is answerable afterwards. The original
-- recipient is otherwise overwritten and nothing remembers it.
ALTER TABLE "DataOrder" ADD COLUMN IF NOT EXISTS "originalRecipientPhone" TEXT;
