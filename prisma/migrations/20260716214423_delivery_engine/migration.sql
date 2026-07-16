-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "deliveryZoneMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "shippingWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "preferredPickupId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_preferredPickupId_fkey" FOREIGN KEY ("preferredPickupId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
