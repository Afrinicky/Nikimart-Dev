-- Affiliate programme: per-product enrolment + per-line commission snapshots,
-- and product archiving (so products with sales are never hard-deleted).

-- Category: admin-set default affiliate commission for the category.
ALTER TABLE "Category" ADD COLUMN "affiliateCommissionRate" DOUBLE PRECISION;

-- Product: enrolment flags + archiving.
ALTER TABLE "Product" ADD COLUMN "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "affiliateEnrolledBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "affiliateCommissionRate" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- OrderItem: affiliate commission snapshot per line.
ALTER TABLE "OrderItem" ADD COLUMN "affiliateCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "affiliateCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "affiliateFundedBy" TEXT NOT NULL DEFAULT '';
