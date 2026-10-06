-- Readings of the provider's wallet, so its movements can be accounted for.
--
-- The provider exposes a balance and nothing else: no statement, no ledger. So
-- money put into that wallet, and money taken out of it by an order placed on
-- the provider's own platform instead of through Nickimart, never appeared
-- anywhere on this side. "How much am I really putting in" had no answer.
--
-- Each row is one reading plus the arithmetic against the reading before it:
-- the balance moved by "change", our own dispatches account for "ourCost" of
-- that, and the remainder is either money somebody added ("credited") or money
-- that left for an order we did not place ("debited"). One of the two is
-- always zero.

CREATE TABLE IF NOT EXISTS "DataProviderBalance" (
  "id"              TEXT NOT NULL,
  "balance"         DOUBLE PRECISION NOT NULL,
  "previousBalance" DOUBLE PRECISION,
  "change"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ourCost"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "credited"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "debited"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source"          TEXT NOT NULL DEFAULT 'sweep',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataProviderBalance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataProviderBalance_createdAt_idx"
  ON "DataProviderBalance"("createdAt");

-- When a refunded order was refunded.
--
-- A paid order marked refunded still read as a full sale in the transactions
-- list, because nothing recorded that the money had gone back. The sale row
-- stays — it happened — and a refund row is now written against it, so money
-- in and money out net to nothing on a cancelled order instead of counting the
-- cash twice. Nullable, and rows refunded before this column existed fall back
-- to "updatedAt", which is when the status was flipped.
ALTER TABLE "DataOrder" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
