-- NikiMart — Neon catch-up SQL for role-based tracking confirmations.
-- Run on the production (Neon) database at/after deploy. Idempotent.
--
-- Replaces time-based auto-advance with per-role confirmations. Adds per-stage
-- confirmation timestamps to Shipment and back-fills existing shipments from
-- their current status so in-progress orders keep their ticked steps.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "processingAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "transitAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'created';

-- Back-fill timestamps from existing status (later stage back-fills earlier).
UPDATE "Shipment" SET "processingAt" = COALESCE("processingAt", "createdAt")
  WHERE status IN ('processing','in_transit','out_for_delivery','delivered');
UPDATE "Shipment" SET "transitAt" = COALESCE("transitAt", "createdAt")
  WHERE status IN ('in_transit','out_for_delivery','delivered');
UPDATE "Shipment" SET "outForDeliveryAt" = COALESCE("outForDeliveryAt", "createdAt")
  WHERE status IN ('out_for_delivery','delivered');
UPDATE "Shipment" SET "deliveredAt" = COALESCE("deliveredAt", "createdAt")
  WHERE status = 'delivered';
