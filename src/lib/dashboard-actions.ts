"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const SHIPMENT_FLOW = ["processing", "in_transit", "out_for_delivery", "delivered"] as const;

/** Freight agent advances one of their shipments to the next status. */
export async function advanceShipmentAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "FREIGHT" && user.role !== "ADMIN") return;

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return;

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return;
  if (user.role === "FREIGHT" && shipment.freightAgentId !== user.id) return;

  const idx = SHIPMENT_FLOW.indexOf(shipment.status as (typeof SHIPMENT_FLOW)[number]);
  const next = SHIPMENT_FLOW[Math.min(idx + 1, SHIPMENT_FLOW.length - 1)];

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { status: next, manualHold: true },
  });

  // Keep the parent order in step with its shipment.
  if (next === "delivered") {
    await prisma.order.update({ where: { id: shipment.orderId }, data: { status: "delivered" } });
  } else if (shipment.status === "processing") {
    await prisma.order.update({ where: { id: shipment.orderId }, data: { status: "shipped" } });
  }

  revalidatePath("/freight");
  revalidatePath("/account");
  revalidatePath("/admin");
}

/** Pickup operator marks an order collected (delivered). */
export async function markCollectedAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "PICKUP" && user.role !== "ADMIN") return;

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { pickupPoint: true, shipment: true },
  });
  if (!order) return;
  if (user.role === "PICKUP" && order.pickupPoint?.operatorId !== user.id) return;

  await prisma.order.update({ where: { id: orderId }, data: { status: "delivered" } });
  if (order.shipment) {
    await prisma.shipment.update({
      where: { orderId },
      data: { status: "delivered", manualHold: true },
    });
  }

  revalidatePath("/pickup");
  revalidatePath("/account");
  revalidatePath("/admin");
}
