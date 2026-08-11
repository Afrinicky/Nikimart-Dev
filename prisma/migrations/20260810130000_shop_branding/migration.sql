-- Shop branding: logo, cover banner, and WhatsApp number on the vendor.
-- (Affiliate columns are added by the affiliate_product_enrolment migration.)
ALTER TABLE "Vendor" ADD COLUMN     "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN     "bannerUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN     "whatsapp" TEXT NOT NULL DEFAULT '';
