import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { notifyOrderConfirmed } from "@/lib/order-notifications";

/**
 * Mark a pending order as paid — idempotently — and start fulfilment.
 *
 * The status flip uses an `updateMany` guarded on `status: "pending"`, so it is
 * atomic: if the verify redirect and the webhook both fire, exactly one wins
 * (count === 1) and creates the shipment; the loser is a no-op. This is why the
 * shipment is created here rather than at order time for paid-online orders — a
 * shipment on an unpaid order would auto-advance by elapsed time and mark the
 * order paid without payment.
 */
export async function markOrderPaid(orderNumber: string): Promise<boolean> {
  const flipped = await prisma.order.updateMany({
    where: { orderNumber, status: "pending" },
    data: { status: "paid" },
  });
  if (flipped.count === 0) return false; // already settled, cancelled, or unknown

  // We won the transition — ensure a shipment exists to drive tracking.
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { shipment: true, pickupPoint: true },
  });
  if (order && !order.shipment) {
    const freightAgent =
      order.deliveryMethod === "delivery"
        ? await prisma.user.findFirst({ where: { role: "FREIGHT" }, select: { id: true } })
        : null;
    const destination =
      order.deliveryMethod === "pickup"
        ? (order.pickupPoint?.name ?? "Pickup point")
        : (order.address ?? "Customer address");
    await prisma.shipment
      .create({
        data: {
          orderId: order.id,
          trackingNumber: `NMF-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`,
          status: "created", // awaiting the seller's "prepared" confirmation
          origin: "NikiMart Warehouse",
          destination,
          eta: new Date(Date.now() + 1000 * 60 * 60 * 48),
          freightAgentId: freightAgent?.id ?? null,
        },
      })
      .catch(() => {});
  }

  // Notify the buyer their payment landed (best-effort).
  if (order) await notifyOrderConfirmed(order.id);

  revalidatePath("/orders");
  revalidatePath("/account");
  revalidatePath("/admin/orders");
  revalidatePath("/freight");
  revalidatePath("/pickup");
  return true;
}
