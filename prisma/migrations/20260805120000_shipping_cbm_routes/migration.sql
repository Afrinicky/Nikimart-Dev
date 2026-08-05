-- CBM pickup-only shipping: product CBM, seller origin hub, and route rates.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cbm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "originPickupId" TEXT;

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "originHubId" TEXT NOT NULL,
    "destPickupId" TEXT NOT NULL,
    "ratePerCbm" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingRate_destPickupId_idx" ON "ShippingRate"("destPickupId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_originHubId_destPickupId_key" ON "ShippingRate"("originHubId", "destPickupId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_originPickupId_fkey" FOREIGN KEY ("originPickupId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_originHubId_fkey" FOREIGN KEY ("originHubId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_destPickupId_fkey" FOREIGN KEY ("destPickupId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
