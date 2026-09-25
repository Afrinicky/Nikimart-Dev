-- An advert-friendly short path on a registration link.
--
-- Facebook and WhatsApp refuse "/become-an-agent?invite=ABCD2345": a query
-- string on a domain their checks don't recognise is what a tracking redirect
-- looks like, so an advert cannot carry the link the admin console issues. A
-- link may now also claim a bare path — nickimart.com/join — which resolves to
-- the same row and therefore to the same fee, uses, expiry and on/off switch.
--
-- Nullable, because a path is the exception rather than the rule: a link shared
-- one-to-one has no reason to spend one, and there are only so many short words.
ALTER TABLE "DataAgentInvite" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Unique, and the uniqueness is the database's job rather than the form's: two
-- admins claiming "/join" at the same moment would both find it free on a
-- pre-check, and one advert would then quietly point at the other's discount.
--
-- NULLs do not collide in Postgres, so every link without a path is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "DataAgentInvite_slug_key" ON "DataAgentInvite"("slug");
