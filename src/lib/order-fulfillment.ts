import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOrderConfirmed, notifyStaffNewOrder } from "@/lib/order-notifications";
import { toPesewas } from "@/lib/payments";

/**
 * Confirm that the amount actually captured covers the order before settling it.
 *
 * Both callers (the post-payment redirect and the webhook) previously trusted
 * the reference alone, so a partial capture — or a transaction initialised for
 * a different amount — would have settled the order in full. A tolerance of one
 * pesewa absorbs rounding between our total and the gateway's integer amount.
 */
export async function paymentCoversOrder(orderNumber: string, amountPesewas: number): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { orderNumber }, select: { total: true } });
  if (!order) return false;
  return amountPesewas + 1 >= toPesewas(order.total);
}

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
export async function markOrderPaid(
  orderNumber: string,
  /**
   * Refresh the pages that list orders. Must be `false` when calling from a
   * page render (the Paystack redirect) — Next throws on revalidation during
   * render, and that crash would land on a buyer who has already paid. Route
   * handlers and server actions can leave it on.
   */
  { revalidate = true }: { revalidate?: boolean } = {},
): Promise<boolean> {
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
          origin: "Nickimart Warehouse",
          destination,
          eta: new Date(Date.now() + 1000 * 60 * 60 * 48),
          freightAgentId: freightAgent?.id ?? null,
        },
      })
      .catch(() => {});
  }

  // Notify the buyer their payment landed, and staff of the new order — after
  // the response is sent so notifications never block the caller.
  if (order) {
    const oid = order.id;
    after(async () => {
      await notifyOrderConfirmed(oid);
      await notifyStaffNewOrder(oid);
    });
  }

  if (revalidate) {
    revalidatePath("/orders");
    revalidatePath("/account");
    revalidatePath("/admin/orders");
    revalidatePath("/freight");
    revalidatePath("/pickup");
  }
  return true;
}
