import { prisma } from "@/lib/prisma";

// Ordered shipment pipeline. Auto-progression only ever moves forward.
export const SHIPMENT_STAGES = ["processing", "in_transit", "out_for_delivery", "delivered"] as const;
export type ShipmentStage = (typeof SHIPMENT_STAGES)[number];

// Buyer-facing labels per delivery method.
export function stageLabel(stage: string, method: "delivery" | "pickup"): string {
  const delivery: Record<string, string> = {
    processing: "Preparing with vendor",
    in_transit: "In transit",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
  };
  const pickup: Record<string, string> = {
    processing: "Preparing with vendor",
    in_transit: "On the way to pickup point",
    out_for_delivery: "Ready for pickup",
    delivered: "Collected",
  };
  return (method === "pickup" ? pickup : delivery)[stage] ?? stage;
}

// Elapsed-time thresholds (minutes from order creation) at which each stage is
// reached. Compressed so progression is observable in a demo; tune as needed.
const STAGE_AT_MINUTES: Record<ShipmentStage, number> = {
  processing: 0,
  in_transit: 10,
  out_for_delivery: 30,
  delivered: 60,
};

/** The stage a shipment *should* be at now, purely from elapsed time. */
export function expectedStage(createdAt: Date, now: Date = new Date()): ShipmentStage {
  const minutes = (now.getTime() - createdAt.getTime()) / 60000;
  let stage: ShipmentStage = "processing";
  for (const s of SHIPMENT_STAGES) {
    if (minutes >= STAGE_AT_MINUTES[s]) stage = s;
  }
  return stage;
}

function orderStatusFor(stage: ShipmentStage): string {
  switch (stage) {
    case "processing":
      return "paid";
    case "delivered":
      return "delivered";
    default:
      return "shipped";
  }
}

type ShipmentLike = { id: string; status: string; manualHold: boolean; createdAt: Date; orderId: string };

/**
 * Advances a single shipment to its expected stage if it's fallen behind and
 * hasn't been manually held. Returns the effective (possibly updated) status.
 * Safe to call on every read — it only writes when the stage actually changes.
 */
export async function syncShipmentProgress(shipment: ShipmentLike): Promise<string> {
  if (shipment.manualHold) return shipment.status;

  const currentIdx = SHIPMENT_STAGES.indexOf(shipment.status as ShipmentStage);
  const target = expectedStage(shipment.createdAt);
  const targetIdx = SHIPMENT_STAGES.indexOf(target);

  if (targetIdx <= currentIdx) return shipment.status;

  await prisma.shipment.update({ where: { id: shipment.id }, data: { status: target } });
  await prisma.order.update({ where: { id: shipment.orderId }, data: { status: orderStatusFor(target) } });
  return target;
}

/** Cron entry point: advance every non-held, non-delivered shipment. */
export async function advanceAllShipments(): Promise<number> {
  const shipments = await prisma.shipment.findMany({
    where: { manualHold: false, status: { not: "delivered" } },
    select: { id: true, status: true, manualHold: true, createdAt: true, orderId: true },
  });
  let changed = 0;
  for (const s of shipments) {
    const before = s.status;
    const after = await syncShipmentProgress(s);
    if (after !== before) changed++;
  }
  return changed;
}

/** A timeline for the buyer: each stage with reached/current flags + ETA. */
export function buildTimeline(createdAt: Date, currentStatus: string, method: "delivery" | "pickup") {
  const currentIdx = SHIPMENT_STAGES.indexOf(currentStatus as ShipmentStage);
  return SHIPMENT_STAGES.map((stage, i) => ({
    stage,
    label: stageLabel(stage, method),
    reached: i <= currentIdx,
    current: i === currentIdx,
    at: new Date(createdAt.getTime() + STAGE_AT_MINUTES[stage] * 60000),
  }));
}
