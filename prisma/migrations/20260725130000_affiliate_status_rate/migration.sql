-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "commissionRate" DOUBLE PRECISION;
