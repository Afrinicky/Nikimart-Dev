"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  SHIPMENT_STAGES,
  STAGE_COLUMN,
  canConfirmStage,
  deriveStatus,
  orderStatusForStage,
  stageLabel,
  type DeliveryMethod,
  type ShipmentStage,
  type ShipmentTimestamps,
} from "@/lib/tracking";
import { notifyShipmentUpdate } from "@/lib/order-notifications";

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
      order: { select: { id: true, deliveryMethod: true, pickupPointId: true } },
    },
  });
  if (!shipment) return { error: "Shipment not found." };

  const method: DeliveryMethod = shipment.order.deliveryMethod === "pickup" ? "pickup" : "delivery";

  // Role may confirm this stage for this method?
  if (!canConfirmStage(user.role, stage, method)) {
    return { error: "You're not responsible for this step." };
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
  };
  const targetIdx = SHIPMENT_STAGES.indexOf(stage);
  const now = new Date();
  const data: Record<string, unknown> = { manualHold: true };
  SHIPMENT_STAGES.forEach((s, i) => {
    if (i <= targetIdx && !ts[STAGE_COLUMN[s]]) {
      data[STAGE_COLUMN[s]] = now;
      ts[STAGE_COLUMN[s]] = now;
    }
  });
  // Freight self-assigns if the consignment was unassigned.
  if (user.role === "FREIGHT" && !shipment.freightAgentId) data.freightAgentId = user.id;

  const status = deriveStatus(ts);
  data.status = status;

  await prisma.shipment.update({ where: { id: shipment.id }, data });
  await prisma.order.update({ where: { id: shipment.order.id }, data: { status: orderStatusForStage(status) } });

  // Tell the buyer their order moved forward (best-effort).
  if (status !== "created") {
    await notifyShipmentUpdate(shipment.order.id, stageLabel(status, method));
  }

  for (const path of ["/orders", "/account", "/freight", "/pickup", "/seller/orders", "/admin", "/admin/orders"]) {
    revalidatePath(path);
  }
  return { ok: true };
}
