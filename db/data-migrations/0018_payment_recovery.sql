-- Recovering a payment the checkout never finished telling us about.
--
-- A bundle order settled in exactly two ways: the buyer's browser completing
-- the Paystack redirect, or Paystack's webhook arriving. Both are things that
-- happen outside this system, and when a MoMo charge succeeds but the checkout
-- is interrupted — the buyer closes the tab, the network drops, Paystack shows
-- "Transaction was already successful" and they press Close — neither happens.
-- The money is captured, the order reads "awaiting payment" forever, and
-- nothing on our side ever asks Paystack again. Wallet top-ups have had a
-- re-check sweep for exactly this failure since they shipped; orders never did.
--
-- Three columns and one table close it:

-- When Paystack was last asked about an unpaid order, so the sweep and the
-- tracker can re-check without asking about the same reference every second.
ALTER TABLE "DataOrder" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);

-- What the provider actually charged for this bundle, as its own order
-- response reported it. Distinct from "costPrice", which is what our price
-- ladder said it would cost: the ladder can be blank or stale, and the
-- provider-wallet bookkeeping subtracts our own spending from the balance to
-- work out what was funded. A cost of zero there turns an ordinary sale into
-- an apparent withdrawal from the wallet by somebody else.
ALTER TABLE "DataOrder" ADD COLUMN IF NOT EXISTS "providerCost" DOUBLE PRECISION;

-- Who settled an order by hand, when nobody could settle it automatically.
ALTER TABLE "DataOrder" ADD COLUMN IF NOT EXISTS "settledBy" TEXT;

CREATE INDEX IF NOT EXISTS "DataOrder_paymentStatus_createdAt_idx"
  ON "DataOrder"("paymentStatus", "createdAt");

-- "I was debited and it still says awaiting payment."
--
-- The buyer is the only person who can see their own MoMo prompt, so when
-- every automatic check has come back empty they are the best evidence there
-- is. A claim is that evidence written down: it reaches the admins the moment
-- it is raised, and the bundle goes out only once an admin has confirmed it
-- against the gateway. Nothing here settles anything on its own.
CREATE TABLE IF NOT EXISTS "DataPaymentClaim" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  -- customer | agent | admin
  "raisedBy"  TEXT NOT NULL DEFAULT 'customer',
  -- How to reach whoever raised it, and what they said happened.
  "contact"   TEXT NOT NULL DEFAULT '',
  "note"      TEXT NOT NULL DEFAULT '',
  -- pending | confirmed | rejected
  "status"    TEXT NOT NULL DEFAULT 'pending',
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "decision"  TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataPaymentClaim_pkey" PRIMARY KEY ("id")
);

-- One open claim per order. A buyer pressing the button twice is the same
-- claim, not two, and the database is what decides that rather than the form.
CREATE UNIQUE INDEX IF NOT EXISTS "DataPaymentClaim_orderId_pending_key"
  ON "DataPaymentClaim"("orderId") WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "DataPaymentClaim_status_createdAt_idx"
  ON "DataPaymentClaim"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataPaymentClaim_orderId_idx"
  ON "DataPaymentClaim"("orderId");

DO $$
BEGIN
  ALTER TABLE "DataPaymentClaim"
    ADD CONSTRAINT "DataPaymentClaim_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DataOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
