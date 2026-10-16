/**
 * Where an order actually is, as one word.
 *
 * `Order.status` has five values and four of them describe money: pending,
 * paid, shipped, delivered, cancelled. For a mall selling locally that is the
 * whole story. For goods bought from a supplier abroad it is almost none of
 * it — "paid" covers everything from a checkout five minutes old to a parcel
 * sitting in a container off Tema, and an admin reading it cannot tell whether
 * the next job is to buy the item or to ring the customer about collection.
 *
 * So the stage shown in the console is derived rather than stored: from the
 * order's own status, from whether its lines have been bought from the
 * supplier yet, and from the shipment's per-stage confirmation timestamps —
 * the three records that already know. Nothing new is written, nothing can
 * drift out of step with them, and the stage moves on its own the moment any
 * of the three is confirmed.
 *
 * Pure, so the table, the detail window and the filter dropdown all agree.
 */

/** Ordered: each stage is further along than the one before it. */
export const FULFILMENT_STAGES = [
  "awaiting_payment",
  "placing",
  "ordered",
  "at_forwarder",
  "in_transit",
  "arrived_ghana",
  "ready",
  "collected",
  "cancelled",
] as const;

export type FulfilmentStage = (typeof FULFILMENT_STAGES)[number];

export type DeliveryMethod = "delivery" | "pickup";
export type OrderRoute = "domestic" | "abroad";

/**
 * What each stage is called in the console.
 *
 * The admin labels, unlike the buyer's, never change with the route or the
 * delivery method: a filter dropdown whose options are renamed per row is not
 * a filter. The buyer-facing wording stays in `lib/tracking`.
 */
export const FULFILMENT_LABELS: Record<FulfilmentStage, string> = {
  awaiting_payment: "Awaiting payment",
  placing: "To be placed",
  ordered: "Ordered from supplier",
  at_forwarder: "At freight forwarder",
  in_transit: "In transit",
  arrived_ghana: "Arrived in Ghana",
  ready: "Ready for collection",
  collected: "Collected by buyer",
  cancelled: "Cancelled",
};

/** The same stage, worded for how this particular order travels. */
export function stageLabelFor(
  stage: FulfilmentStage,
  method: DeliveryMethod,
  route: OrderRoute,
): string {
  if (stage === "placing") return route === "abroad" ? "To be placed with supplier" : "Being prepared";
  if (stage === "ordered") return route === "abroad" ? "Ordered from supplier" : "Prepared by seller";
  if (stage === "ready") return method === "pickup" ? "Ready for pickup" : "Out for delivery";
  if (stage === "collected") return method === "pickup" ? "Collected by buyer" : "Delivered";
  return FULFILMENT_LABELS[stage];
}

/** Pill classes. Reads left to right: waiting, moving, landed, done, dead. */
export const FULFILMENT_TONES: Record<FulfilmentStage, string> = {
  awaiting_payment: "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30",
  placing: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25",
  ordered: "bg-niki-orange/10 text-niki-orange ring-1 ring-niki-orange/25",
  at_forwarder: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  in_transit: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  arrived_ghana: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25",
  ready: "bg-niki-trust/15 text-niki-trust ring-1 ring-niki-trust/30",
  collected: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  cancelled: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
};

/** The reserved chart colours for the stage mix, a step darker than the pills. */
export const FULFILMENT_COLOUR: Record<FulfilmentStage, string> = {
  awaiting_payment: "#d97706",
  placing: "#ff6a00",
  ordered: "#ea580c",
  at_forwarder: "#b45309",
  in_transit: "#0284c7",
  arrived_ghana: "#0369a1",
  ready: "#2563eb",
  collected: "#059669",
  cancelled: "#dc2626",
};

export function isFulfilmentStage(value: string): value is FulfilmentStage {
  return (FULFILMENT_STAGES as readonly string[]).includes(value);
}

/** The filter dropdown's options, in the order work moves through them. */
export const FULFILMENT_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...FULFILMENT_STAGES.map((s) => ({ value: s, label: FULFILMENT_LABELS[s] })),
];

/** What a shipment knows about where it got to. */
export interface StageStamps {
  processingAt?: Date | null;
  forwarderReceivedAt?: Date | null;
  transitAt?: Date | null;
  arrivedGhanaAt?: Date | null;
  outForDeliveryAt?: Date | null;
  deliveredAt?: Date | null;
}

/**
 * The stage an order is at.
 *
 * Read from the furthest confirmation backwards, because a back-filled
 * timestamp means an earlier stage was confirmed too and the latest one is the
 * only one that says where the goods are. Money comes first: an unpaid or
 * cancelled order has no fulfilment to speak of.
 *
 * `placed` is whether any of its lines have been bought from the supplier. It
 * is what separates a brand-new order from one already on its way, on the day
 * before the shipment has been touched.
 */
export function deriveStage(order: {
  status: string;
  shipment?: StageStamps | null;
  placed?: boolean;
}): FulfilmentStage {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending") return "awaiting_payment";

  const s = order.shipment;
  if (s) {
    if (s.deliveredAt) return "collected";
    if (s.outForDeliveryAt) return "ready";
    if (s.arrivedGhanaAt) return "arrived_ghana";
    if (s.transitAt) return "in_transit";
    if (s.forwarderReceivedAt) return "at_forwarder";
    if (s.processingAt) return "ordered";
  }

  // No confirmation on the shipment yet. An admin who forced the order's own
  // status is still telling us something, so it is read before falling back.
  if (order.status === "delivered") return "collected";
  if (order.status === "shipped") return "in_transit";
  return order.placed ? "ordered" : "placing";
}

/**
 * What to do next, and where it is done.
 *
 * The one thing the console is for. Every stage but the last two hands the
 * order to somebody, and the admin reading it should not have to work out who.
 */
export interface NextAction {
  /** The imperative, as a button reads. */
  label: string;
  /** Why it is the next thing. One line. */
  detail: string;
  /** Where the job is actually done, when it is not done on this screen. */
  href?: string;
  /** The shipment stage this action confirms, when it is a confirmation. */
  stage?: "processing" | "at_forwarder" | "in_transit" | "arrived_ghana" | "out_for_delivery" | "delivered";
}

export function nextAction(
  stage: FulfilmentStage,
  method: DeliveryMethod,
  route: OrderRoute,
): NextAction | null {
  switch (stage) {
    case "awaiting_payment":
      return {
        label: "Chase the payment",
        detail: "The buyer started checkout and never finished. Reach them on WhatsApp below.",
      };
    case "placing":
      return route === "abroad"
        ? {
            label: "Place it with the supplier",
            detail: "Paid for and not yet bought. It waits in the placement queue until the lane fills.",
            href: "/admin/orders/placement",
          }
        : {
            label: "Confirm the seller has prepared it",
            detail: "Paid for. The shop packs it, and confirming that moves the order on.",
            stage: "processing",
          };
    case "ordered":
      return route === "abroad"
        ? {
            label: "Confirm the forwarder has it",
            detail: "Bought from the supplier. Confirm when the forwarder reports the parcel in.",
            stage: "at_forwarder",
          }
        : {
            label: "Confirm it has left",
            detail: "Packed and waiting on the courier run.",
            stage: "in_transit",
          };
    case "at_forwarder":
      return {
        label: "Confirm it has shipped",
        detail: "At the forwarder abroad. Confirm once the consignment is on its way.",
        stage: "in_transit",
      };
    case "in_transit":
      return route === "abroad"
        ? {
            label: "Confirm it landed in Ghana",
            detail: "In transit. Confirm on arrival and clearance at the Ghana point.",
            stage: "arrived_ghana",
          }
        : {
            label: method === "pickup" ? "Confirm ready for pickup" : "Confirm out for delivery",
            detail: "On the way. Confirm when it reaches the handover point.",
            stage: "out_for_delivery",
          };
    case "arrived_ghana":
      return {
        label: method === "pickup" ? "Confirm ready for pickup" : "Confirm out for delivery",
        detail:
          method === "pickup"
            ? "Landed in Ghana. Confirm once it is at the Nickimart pickup point."
            : "Landed in Ghana. Confirm once it is with the courier.",
        stage: "out_for_delivery",
      };
    case "ready":
      return {
        label: method === "pickup" ? "Mark collected" : "Mark delivered",
        detail:
          method === "pickup"
            ? "Waiting on the buyer. Mark it once they have collected and confirmed receipt."
            : "With the courier. Mark it once the buyer has it.",
        stage: "delivered",
      };
    default:
      return null;
  }
}

/** A stage's place in the run, for drawing a progress rail. 0–1. */
export function stageProgress(stage: FulfilmentStage, route: OrderRoute): number {
  if (stage === "cancelled") return 0;
  const run: FulfilmentStage[] =
    route === "abroad"
      ? ["awaiting_payment", "placing", "ordered", "at_forwarder", "in_transit", "arrived_ghana", "ready", "collected"]
      : ["awaiting_payment", "placing", "ordered", "in_transit", "ready", "collected"];
  const at = run.indexOf(stage);
  if (at < 0) return 0;
  return at / (run.length - 1);
}
