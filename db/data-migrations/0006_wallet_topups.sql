-- Agent wallet top-ups.
--
-- A top-up used to be nothing but a Paystack reference with the agent id in
-- the transaction metadata. When the money was captured but the settlement
-- never ran — a return URL that landed on a deployment without the code, a
-- webhook dropped, metadata missing on a replay — nothing recorded that the
-- agent had even tried, and the payment could only be found by hand in the
-- Paystack dashboard. This table is the record: written before the agent
-- reaches the gateway, so an unsettled top-up is always visible and always
-- creditable from its reference alone.

CREATE TABLE IF NOT EXISTS "DataWalletTopup" (
  "id"             TEXT NOT NULL,
  "agentId"        TEXT NOT NULL,
  "reference"      TEXT NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "creditedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "paidAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataWalletTopup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataWalletTopup_reference_key"
  ON "DataWalletTopup"("reference");
CREATE INDEX IF NOT EXISTS "DataWalletTopup_agentId_createdAt_idx"
  ON "DataWalletTopup"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataWalletTopup_status_createdAt_idx"
  ON "DataWalletTopup"("status", "createdAt");

DO $$
BEGIN
  ALTER TABLE "DataWalletTopup"
    ADD CONSTRAINT "DataWalletTopup_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DataAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
