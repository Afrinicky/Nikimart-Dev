-- 0003 — the registration fee, and who pays which part of it.
--
-- Until now a registration fee was one number: what the admin had set, charged
-- to every new agent the same way. The programme needs it broken up, because a
-- referrer can now bring somebody in at a discount and take a share of what
-- they do pay, and none of that is reconstructable after the fact from a
-- single total.
--
-- `setupFee` keeps its meaning — what this agent actually owes — so nothing
-- reading it needs to change. The four columns beside it say how that number
-- came about: the fee at full price, the percentage waived, what the waiver
-- was worth, and the share of the paid amount credited to the recruiter.
--
-- `referralWaiverPercent` is the other direction: the discount *this* agent's
-- own recruits get. It is nullable on purpose — null means "whatever the
-- programme default is right now", which is different from an explicit zero.
--
-- Existing agents are unaffected, and nothing is backfilled here: a migration
-- that rewrote money columns on live rows is the wrong place to make that
-- judgement. Their gross stays at 0, which the code reads as "no waiver was
-- involved — the gross was the fee" (see registrationFeeBreakdown).

ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "setupFeeGross"         DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "setupFeeWaiverPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "setupFeeWaived"        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "setupFeeReferrerShare" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DataAgent" ADD COLUMN IF NOT EXISTS "referralWaiverPercent" DOUBLE PRECISION;
