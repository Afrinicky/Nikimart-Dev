-- Per-product affiliate enrollment + shop branding (logo/banner) + WhatsApp.
ALTER TABLE "Product" ADD COLUMN     "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN     "affiliateCommission" DOUBLE PRECISION;
ALTER TABLE "Vendor" ADD COLUMN     "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN     "bannerUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN     "whatsapp" TEXT NOT NULL DEFAULT '';
