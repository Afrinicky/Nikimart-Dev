"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  SHIPMENT_STAGES,
  STAGE_COLUMN,
  canConfirmStage,
  deriveStatus,
  orderStatusForStage,
  stageLabel,
  stagesFor,
  type DeliveryMethod,
  type ShipmentRoute,
  type ShipmentStage,
  type ShipmentTimestamps,
} from "@/lib/tracking";
import { notifyShipmentUpdate, notifyNextResponsible } from "@/lib/order-notifications";
import { syncAffiliateCommissions } from "@/lib/affiliate-ledger";
import { issueCollectionCode } from "@/lib/pickup-collection";

export type ConfirmState = { ok?: boolean; error?: string };

/**
 * Confirm a shipment stage. Enforces role-based ownership: sellers confirm
 * "prepared", freight confirms transit/out-for-delivery/delivered, pickup
 * operators confirm ready/collected, and admins can confirm anything.
 * Confirming a later stage back-fills any earlier unconfirmed stages.
 */
export async function confirmShipmentStage(_prev: ConfirmState, fd: FormData): Promise<ConfirmState> {
  const user = await requireUser();
  const shipmentId = String(fd.get("shipmentId") ?? "");
  const stage = String(fd.get("stage") ?? "") as ShipmentStage;
  if (!shipmentId || !SHIPMENT_STAGES.includes(stage)) return { error: "Invalid confirmation." };

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      freightAgentId: true,
      processingAt: true,
      transitAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      forwarderReceivedAt: true,
      arrivedGhanaAt: true,
      order: {
        select: { id: true, deliveryMethod: true, pickupPointId: true, hasAbroadItems: true },
      },
    },
  });
  if (!shipment) return { error: "Shipment not found." };

  const method: DeliveryMethod = shipment.order.deliveryMethod === "pickup" ? "pickup" : "delivery";
  // An imported consignment has two extra milestones — the forwarder hand-off
  // and the landing in Ghana — that a domestic one does not, so which stages
  // exist at all depends on the route.
  const route: ShipmentRoute = shipment.order.hasAbroadItems ? "abroad" : "domestic";
  const stages = stagesFor(route);

  // A stage that isn't on this route can't be confirmed for it: nothing should
  // be able to mark a parcel moving across Accra as "arrived in Ghana".
  if (!stages.includes(stage)) {
    return { error: "That step doesn't apply to this consignment." };
  }

  // Role may confirm this stage for this method?
  if (!canConfirmStage(user.role, stage, method, route)) {
    return { error: "You're not responsible for this step." };
  }

  // The one stage that is not a tick-box. Handing a parcel over the counter
  // needs the buyer's collection code and a record of who took it, and both
  // live in releaseParcel (lib/pickup-actions.ts). Letting this generic path
  // mark a pickup collected would be the hole that guard exists to close —
  // for an admin as much as for an operator, since an admin override has to
  // carry a written reason rather than be one click.
  if (stage === "delivered" && method === "pickup") {
    return {
      error: "Collect it from the parcel's own card — the buyer's code and who is collecting are both needed.",
    };
  }

  // Ownership checks per role.
  if (user.role === "SELLER") {
    const owns = await prisma.orderItem.count({
      where: { orderId: shipment.order.id, product: { vendor: { ownerId: user.id } } },
    });
    if (owns === 0) return { error: "This order doesn't contain your products." };
  } else if (user.role === "FREIGHT") {
    if (shipment.freightAgentId && shipment.freightAgentId !== user.id) {
      return { error: "This consignment is assigned to another agent." };
    }
  } else if (user.role === "PICKUP") {
    const point = await prisma.pickupPoint.findFirst({
      where: { id: shipment.order.pickupPointId ?? "__none__", operatorId: user.id },
      select: { id: true },
    });
    if (!point) return { error: "This order isn't routed to your pickup point." };
  }

  // Build the update: set this stage's timestamp and back-fill earlier ones.
  const ts: ShipmentTimestamps = {
    processingAt: shipment.processingAt,
    transitAt: shipment.transitAt,
    outForDeliveryAt: shipment.outForDeliveryAt,
    deliveredAt: shipment.deliveredAt,
    forwarderReceivedAt: shipment.forwarderReceivedAt,
    arrivedGhanaAt: shipment.arrivedGhanaAt,
  };
  const targetIdx = stages.indexOf(stage);
  const now = new Date();
  const data: Record<string, unknown> = { manualHold: true };
  stages.forEach((s, i) => {
    if (i <= targetIdx && !ts[STAGE_COLUMN[s]]) {
      data[STAGE_COLUMN[s]] = now;
      ts[STAGE_COLUMN[s]] = now;
    }
  });
  // Freight self-assigns if the consignment was unassigned.
  if (user.role === "FREIGHT" && !shipment.freightAgentId) data.freightAgentId = user.id;

  const status = deriveStatus(ts, route);
  data.status = status;

  await prisma.shipment.update({ where: { id: shipment.id }, data });
  await prisma.order.update({ where: { id: shipment.order.id }, data: { status: orderStatusForStage(status) } });

  // Delivery confirmed on the shipment is what starts an affiliate's return
  // window, so the commission ledger is reconciled from the same transition.
  await syncAffiliateCommissions(shipment.order.id);

  // Tell the buyer their order moved forward, and hand the job to the next role
  // — after the response so notifications never block the confirmation.
  if (status !== "created") {
    const oid = shipment.order.id;
    const label = stageLabel(status, method, route);
    const actingRole = user.role;
    const readyForCollection = method === "pickup" && status === "out_for_delivery";
    after(async () => {
      // A parcel that has just reached its point needs a collection code
      // before anything else: the buyer's next move is to walk in and ask for
      // it, and the counter cannot release it without one. The generic
      // "status changed" text is skipped in that case — the code message says
      // it is ready, says where, and says what to bring, which is strictly
      // more than the status line it replaces.
      if (readyForCollection) await issueCollectionCode(oid);
      else await notifyShipmentUpdate(oid, label, status);
      await notifyNextResponsible(oid, actingRole);
    });
  }

  for (const path of ["/orders", "/account", "/freight", "/pickup", "/seller/orders", "/admin", "/admin/orders"]) {
    revalidatePath(path);
  }
  return { ok: true };
}
