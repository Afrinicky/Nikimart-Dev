-- Who actually paid a registration, and who decides how the next one is paid.
--
-- Two columns, both about the same thing: the registration fee is what
-- releases a recruiter's reward, so it matters a great deal *how* it came to
-- be settled and *who* was allowed to choose.

-- How this agent's registration fee was settled:
--   PAYMENT    — money went through Paystack, or their recruiter's wallet.
--   COMMISSION — it cleared itself out of the commission they earned.
--   ADJUSTMENT — an admin credited their balance and that is what cleared it.
--   WAIVED     — there was nothing to pay.
-- Only ADJUSTMENT changes what anybody earns: a fee an admin wrote off was
-- never paid, so it pays the recruiter nothing. NULL means a registration
-- settled before this column existed, which is treated as genuinely paid —
-- rewriting history downwards would take back rewards already credited.
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "setupFeeSettledBy" TEXT;

-- How the people *this* agent recruits may settle their own registration:
-- UPFRONT, COMMISSION or BOTH. NULL means "whatever the programme says", which
-- is the default and what every existing agent keeps. It is only consulted
-- when the admin has allowed per-agent exceptions.
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "recruitPaymentMode" TEXT;
