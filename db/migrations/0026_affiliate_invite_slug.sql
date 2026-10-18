-- A short path for an affiliate registration link.
--
-- The same reason the bundle programme's links have one: the link the console
-- issues is /become-an-affiliate?invite=ABCD2345, and Facebook and WhatsApp
-- refuse it — a query string on a domain their checks don't recognise is the
-- shape of a tracking redirect, so the advert never runs. A bare path is the
-- same link without the shape they object to, and the same row behind it: the
-- same discount, cap, expiry and switch.
--
-- Additive and idempotent, per db/migrations/README.md.

ALTER TABLE "AffiliateInvite" ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateInvite_slug_key" ON "AffiliateInvite"("slug");
