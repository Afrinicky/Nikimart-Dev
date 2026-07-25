-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "bankAccountName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankAccountNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "momoName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "momoNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutMethod" TEXT NOT NULL DEFAULT '';
