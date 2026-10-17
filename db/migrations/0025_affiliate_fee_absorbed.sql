-- What a registration fee has already taken out of commission.
--
-- The fee is paid down by the commissions that clear, and how much it has
-- taken has to be remembered: the payable balance is derived from the
-- commission lines every time it is read, so without this the money the fee
-- consumed would reappear the moment the fee was marked settled, and the same
-- cedis would be counted twice — once against the fee and once in the
-- affiliate's pocket.
--
-- Additive and idempotent, per db/migrations/README.md. Zero for everybody,
-- which is right: nobody has been charged one yet.

ALTER TABLE "Affiliate"
  ADD COLUMN IF NOT EXISTS "registrationFromCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
