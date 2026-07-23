import type { Role } from "@/lib/roles";

// Ordered shipment pipeline. Advanced only by role-based confirmations.
export const SHIPMENT_STAGES = ["processing", "in_transit", "out_for_delivery", "delivered"] as const;
export type ShipmentStage = (typeof SHIPMENT_STAGES)[number];
export type DeliveryMethod = "delivery" | "pickup";

/** The Shipment column that timestamps each stage's confirmation. */
export const STAGE_COLUMN: Record<ShipmentStage, "processingAt" | "transitAt" | "outForDeliveryAt" | "deliveredAt"> = {
  processing: "processingAt",
  in_transit: "transitAt",
  out_for_delivery: "outForDeliveryAt",
  delivered: "deliveredAt",
};

export type ShipmentTimestamps = {
  processingAt: Date | null;
  transitAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
};

// Buyer-facing labels per delivery method.
export function stageLabel(stage: string, method: DeliveryMethod): string {
  const delivery: Record<string, string> = {
    processing: "Prepared by seller",
    in_transit: "In transit",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
  };
  const pickup: Record<string, string> = {
    processing: "Prepared by seller",
    in_transit: "On the way to pickup point",
    out_for_delivery: "Ready for pickup",
    delivered: "Collected",
  };
  return (method === "pickup" ? pickup : delivery)[stage] ?? stage;
}

/** Action-style label for a confirm button. */
export function confirmActionLabel(stage: ShipmentStage, method: DeliveryMethod): string {
  const delivery: Record<ShipmentStage, string> = {
    processing: "Confirm prepared",
    in_transit: "Confirm picked up",
    out_for_delivery: "Confirm out for delivery",
    delivered: "Mark delivered",
  };
  const pickup: Record<ShipmentStage, string> = {
    processing: "Confirm prepared",
    in_transit: "Confirm en route",
    out_for_delivery: "Confirm ready for pickup",
    delivered: "Mark collected",
  };
  return (method === "pickup" ? pickup : delivery)[stage];
}

/** Who is responsible for confirming each stage. */
export function stageRoleLabel(stage: ShipmentStage, method: DeliveryMethod): string {
  if (stage === "processing") return "Seller";
  if (method === "pickup") return stage === "in_transit" ? "Freight" : "Pickup operator";
  return "Freight";
}

/** The confirmed timestamp for a stage, or null. */
export function stageAt(ts: ShipmentTimestamps, stage: ShipmentStage): Date | null {
  return ts[STAGE_COLUMN[stage]];
}

/** Furthest confirmed stage index, or -1 if none confirmed yet. */
export function confirmedIndex(ts: ShipmentTimestamps): number {
  let idx = -1;
  SHIPMENT_STAGES.forEach((s, i) => {
    if (stageAt(ts, s)) idx = i;
  });
  return idx;
}

/** Derived shipment status: furthest confirmed stage, or "created". */
export function deriveStatus(ts: ShipmentTimestamps): string {
  const idx = confirmedIndex(ts);
  return idx < 0 ? "created" : SHIPMENT_STAGES[idx];
}

export function orderStatusForStage(stage: string): string {
  switch (stage) {
    case "delivered":
      return "delivered";
    case "in_transit":
    case "out_for_delivery":
      return "shipped";
    default:
      return "paid"; // processing / created
  }
}

/** Which stages a role may confirm, given the delivery method. */
export function allowedStages(role: Role, method: DeliveryMethod): ShipmentStage[] {
  if (role === "ADMIN") return [...SHIPMENT_STAGES]; // admin overrides everyone
  if (role === "SELLER") return ["processing"];
  if (role === "FREIGHT") {
    return method === "pickup" ? ["in_transit"] : ["in_transit", "out_for_delivery", "delivered"];
  }
  if (role === "PICKUP") {
    return method === "pickup" ? ["out_for_delivery", "delivered"] : [];
  }
  return [];
}

export function canConfirmStage(role: Role, stage: ShipmentStage, method: DeliveryMethod): boolean {
  return allowedStages(role, method).includes(stage);
}

/** The next stage this role should confirm (first unconfirmed allowed stage). */
export function nextStageForRole(
  role: Role,
  method: DeliveryMethod,
  ts: ShipmentTimestamps,
): ShipmentStage | null {
  const allowed = allowedStages(role, method);
  for (const stage of SHIPMENT_STAGES) {
    if (allowed.includes(stage) && !stageAt(ts, stage)) return stage;
  }
  return null;
}

export interface TimelineStep {
  stage: ShipmentStage;
  label: string;
  role: string;
  done: boolean;
  current: boolean;
  at: Date | null;
}

/** Buyer-facing timeline built from confirmation timestamps (with back-fill). */
export function buildTimeline(ts: ShipmentTimestamps, method: DeliveryMethod): TimelineStep[] {
  const currentIdx = confirmedIndex(ts);
  return SHIPMENT_STAGES.map((stage, i) => ({
    stage,
    label: stageLabel(stage, method),
    role: stageRoleLabel(stage, method),
    done: i <= currentIdx,
    current: i === currentIdx,
    at: stageAt(ts, stage),
  }));
}
