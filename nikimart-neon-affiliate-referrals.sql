-- NikiMart — Neon catch-up SQL for the affiliate/referral system.
-- Run on the production (Neon) database at/after deploy. Idempotent.
-- Requires the base affiliate tables (nikimart-neon-affiliates.sql) to exist.
--
-- Links affiliates to user accounts (self-registration) and attributes
-- referred orders + commission.

ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_userId_key" ON "Affiliate"("userId");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Affiliate_userId_fkey') THEN
    ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_affiliateId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Default affiliate commission rate (percent). Change it in Admin -> Settings.
INSERT INTO "SiteSetting" ("key","value") VALUES ('affiliateRate','5')
ON CONFLICT ("key") DO NOTHING;
