-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "outForDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "transitAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'created';

-- Back-fill per-stage confirmation timestamps from existing status so orders
-- already in progress keep their ticked steps (later stage back-fills earlier).
UPDATE "Shipment" SET "processingAt" = COALESCE("processingAt", "createdAt")
  WHERE status IN ('processing','in_transit','out_for_delivery','delivered');
UPDATE "Shipment" SET "transitAt" = COALESCE("transitAt", "createdAt")
  WHERE status IN ('in_transit','out_for_delivery','delivered');
UPDATE "Shipment" SET "outForDeliveryAt" = COALESCE("outForDeliveryAt", "createdAt")
  WHERE status IN ('out_for_delivery','delivered');
UPDATE "Shipment" SET "deliveredAt" = COALESCE("deliveredAt", "createdAt")
  WHERE status = 'delivered';
