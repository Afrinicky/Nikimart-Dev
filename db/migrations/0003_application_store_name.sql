-- Keep the store name an applicant actually typed.
--
-- The form asked for one ("Nickland"), turned it into a slug, and threw the
-- text away — so approval had nothing to name the store after and invented
-- "<first name>'s Data". Someone who asked to trade as Nickland found their
-- storefront called Nicholas's Data.
--
-- Existing rows get an empty string; approval falls back to title-casing the
-- slug for those, which is much closer to what was asked for than a name
-- derived from the applicant.
--
-- Safe to re-run.

ALTER TABLE "DataAgentApplication"
  ADD COLUMN IF NOT EXISTS "storeName" TEXT NOT NULL DEFAULT '';
