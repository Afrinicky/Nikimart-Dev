import type { Role } from "@/lib/roles";

/**
 * The shipment pipeline, in two shapes.
 *
 * A domestic order is prepared, carried, and handed over: four stages, days
 * apart. An order shipped from abroad passes the same four and two more that
 * only exist because the goods cross a border — they sit at a forwarder while a
 * container fills, and they land in Ghana weeks before anyone can collect them.
 *
 * Those two stages are not cosmetic. "Arrived in Ghana" is the moment a buyer
 * has been waiting a month for and the moment a goods-only payment plan falls
 * due, so it has to be a confirmable milestone with its own timestamp, not an
 * inference from "in transit" ending. A pipeline with no room for the wait
 * leaves a buyer staring at "in transit" for six weeks, which is how support
 * tickets are made.
 */

/** The route a consignment takes, which decides which stages it has. */
export type ShipmentRoute = "domestic" | "abroad";

export const DOMESTIC_STAGES = ["processing", "in_transit", "out_for_delivery", "delivered"] as const;

export const ABROAD_STAGES = [
  "processing",
  "at_forwarder",
  "in_transit",
  "arrived_ghana",
  "out_for_delivery",
  "delivered",
] as const;

/** Every stage name across both routes. */
export const SHIPMENT_STAGES = ABROAD_STAGES;

export type ShipmentStage = (typeof ABROAD_STAGES)[number];
export type DeliveryMethod = "delivery" | "pickup";

/** The ordered stages for a route. */
export function stagesFor(route: ShipmentRoute): readonly ShipmentStage[] {
  return route === "abroad" ? ABROAD_STAGES : DOMESTIC_STAGES;
}

export type StageColumn =
  | "processingAt"
  | "forwarderReceivedAt"
  | "transitAt"
  | "arrivedGhanaAt"
  | "outForDeliveryAt"
  | "deliveredAt";

/** The Shipment column that timestamps each stage's confirmation. */
export const STAGE_COLUMN: Record<ShipmentStage, StageColumn> = {
  processing: "processingAt",
  at_forwarder: "forwarderReceivedAt",
  in_transit: "transitAt",
  arrived_ghana: "arrivedGhanaAt",
  out_for_delivery: "outForDeliveryAt",
  delivered: "deliveredAt",
};

export type ShipmentTimestamps = {
  processingAt: Date | null;
  transitAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  /** Abroad only; absent on a domestic consignment. */
  forwarderReceivedAt?: Date | null;
  arrivedGhanaAt?: Date | null;
};

// Buyer-facing labels per delivery method. The abroad route relabels the shared
// stages too: "prepared by seller" is wrong for an item the seller has only
// just ordered from a supplier in Guangzhou.
export function stageLabel(stage: string, method: DeliveryMethod, route: ShipmentRoute = "domestic"): string {
  if (route === "abroad") {
    const abroad: Record<string, string> = {
      processing: "Ordered from the supplier",
      at_forwarder: "At the freight forwarder",
      in_transit: "In transit to Ghana",
      arrived_ghana: "Arrived in Ghana",
      out_for_delivery: method === "pickup" ? "Ready for pickup" : "Out for delivery",
      delivered: method === "pickup" ? "Collected" : "Delivered",
    };
    if (abroad[stage]) return abroad[stage];
  }
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
export function confirmActionLabel(
  stage: ShipmentStage,
  method: DeliveryMethod,
  route: ShipmentRoute = "domestic",
): string {
  if (route === "abroad") {
    const abroad: Partial<Record<ShipmentStage, string>> = {
      processing: "Confirm ordered from supplier",
      at_forwarder: "Confirm received by forwarder",
      in_transit: "Confirm departed origin",
      arrived_ghana: "Confirm arrived in Ghana",
      out_for_delivery: method === "pickup" ? "Confirm ready for pickup" : "Confirm out for delivery",
      delivered: method === "pickup" ? "Mark collected" : "Mark delivered",
    };
    if (abroad[stage]) return abroad[stage]!;
  }
  const delivery: Partial<Record<ShipmentStage, string>> = {
    processing: "Confirm prepared",
    in_transit: "Confirm picked up",
    out_for_delivery: "Confirm out for delivery",
    delivered: "Mark delivered",
  };
  const pickup: Partial<Record<ShipmentStage, string>> = {
    processing: "Confirm prepared",
    in_transit: "Confirm en route",
    out_for_delivery: "Confirm ready for pickup",
    delivered: "Mark collected",
  };
  return (method === "pickup" ? pickup : delivery)[stage] ?? `Confirm ${stage}`;
}

/** The role responsible for confirming a stage. */
export function responsibleRole(stage: ShipmentStage, method: DeliveryMethod): Role {
  if (stage === "processing") return "SELLER";
  // The forwarder hand-off, the ocean/air leg and the landing are all freight's
  // to confirm — they are the only party who can see any of them.
  if (stage === "at_forwarder" || stage === "arrived_ghana") return "FREIGHT";
  if (method === "pickup") return stage === "in_transit" ? "FREIGHT" : "PICKUP";
  return "FREIGHT";
}

/** Who is responsible for confirming each stage. */
export function stageRoleLabel(stage: ShipmentStage, method: DeliveryMethod): string {
  const role = responsibleRole(stage, method);
  if (role === "SELLER") return "Seller";
  if (role === "FREIGHT") return "Freight";
  return "Pickup operator";
}

/** The confirmed timestamp for a stage, or null. */
export function stageAt(ts: ShipmentTimestamps, stage: ShipmentStage): Date | null {
  return ts[STAGE_COLUMN[stage]] ?? null;
}

/** Furthest confirmed stage index on this route, or -1 if none confirmed yet. */
export function confirmedIndex(ts: ShipmentTimestamps, route: ShipmentRoute = "domestic"): number {
  let idx = -1;
  stagesFor(route).forEach((s, i) => {
    if (stageAt(ts, s)) idx = i;
  });
  return idx;
}

/** Derived shipment status: furthest confirmed stage, or "created". */
export function deriveStatus(ts: ShipmentTimestamps, route: ShipmentRoute = "domestic"): string {
  const stages = stagesFor(route);
  const idx = confirmedIndex(ts, route);
  return idx < 0 ? "created" : stages[idx];
}

export function orderStatusForStage(stage: string): string {
  switch (stage) {
    case "delivered":
      return "delivered";
    case "in_transit":
    case "arrived_ghana":
    case "out_for_delivery":
      return "shipped";
    default:
      return "paid"; // processing / at_forwarder / created
  }
}

/** Which stages a role may confirm, given the route and delivery method. */
export function allowedStages(
  role: Role,
  method: DeliveryMethod,
  route: ShipmentRoute = "domestic",
): ShipmentStage[] {
  const stages = stagesFor(route);
  if (role === "ADMIN") return [...stages]; // admin overrides everyone
  return stages.filter((s) => responsibleRole(s, method) === role);
}

export function canConfirmStage(
  role: Role,
  stage: ShipmentStage,
  method: DeliveryMethod,
  route: ShipmentRoute = "domestic",
): boolean {
  return allowedStages(role, method, route).includes(stage);
}

/** The next stage this role should confirm (first unconfirmed allowed stage). */
export function nextStageForRole(
  role: Role,
  method: DeliveryMethod,
  ts: ShipmentTimestamps,
  route: ShipmentRoute = "domestic",
): ShipmentStage | null {
  const allowed = allowedStages(role, method, route);
  for (const stage of stagesFor(route)) {
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
export function buildTimeline(
  ts: ShipmentTimestamps,
  method: DeliveryMethod,
  route: ShipmentRoute = "domestic",
): TimelineStep[] {
  const currentIdx = confirmedIndex(ts, route);
  return stagesFor(route).map((stage, i) => ({
    stage,
    label: stageLabel(stage, method, route),
    role: stageRoleLabel(stage, method),
    done: i <= currentIdx,
    current: i === currentIdx,
    at: stageAt(ts, stage),
  }));
}
