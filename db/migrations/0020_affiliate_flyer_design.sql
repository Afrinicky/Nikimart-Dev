-- An affiliate's own flyer design.
--
-- The flyer stopped being a fixed drawing with six colourways: the layout, the
-- lettering and the colours are now data, an admin sets the house design in
-- Admin → Affiliates → Branding, and an affiliate may layer their own on top
-- of it. Empty means they are happy with the house style, which is also what
-- lets a change to it reach them.
--
-- The house design and the photo watermark are site settings rather than
-- columns, so they need nothing here.
--
-- Additive and idempotent, per db/migrations/README.md.

ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "flyerDesign" TEXT NOT NULL DEFAULT '';
