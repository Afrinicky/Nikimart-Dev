"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PURCHASE_STATUSES } from "@/lib/purchasing";
import {
  confirmStageForOrders,
  orderIdsForItems,
  orderIdsForPurchase,
  rollBackPlacement,
} from "@/lib/retail/stage-sync";

/**
 * Placing the international orders.
 *
 * Admin-only, and not as a formality: this is the moment the platform's money
 * leaves for a supplier abroad. A seller can watch their own queue and see
 * whether their goods have been bought; they cannot buy.
 *
 * Placing a purchase attaches the customer lines it covers, which is what takes
 * them out of the queue. The attachment is scoped in the same query that writes
 * it — a line already on another purchase is skipped rather than moved, so two
 * admins working the queue at once cannot buy the same goods twice.
 *
 * The lines may come from more than one queue row. A supplier who sells shoes
 * also sells bags, and the two lanes they travel on are the forwarder's
 * business rather than the supplier's — so an admin buying from one supplier
 * in one sitting records one purchase, and quotes one reference back.
 *
 * And placement is the moment the order itself moves: it is bought now, which
 * is a thing the buyer has been waiting to be told. Nobody presses a button
 * for that transition, so this stamps it.
 */

export type PurchaseState = {
  ok?: boolean;
  error?: string;
  reference?: string;
  /** The record just written, so the caller can open it and fill in the money. */
  purchaseId?: string;
  /** How many customer orders the purchase just covered. */
  orders?: number;
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function revalidatePurchasing() {
  revalidatePath("/admin/purchasing");
  revalidatePath("/seller/purchasing");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/placement");
  revalidatePath("/orders");
  revalidatePath("/account");
}

/** NM-PO-… — short enough to read down a phone to a supplier. */
function reference(): string {
  return `NM-PO-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Record a purchase for the lines an admin has just bought.
 *
 * The line ids come from the queue on the screen. They are re-read here rather
 * than trusted: only lines that are still unattached, still on a live order and
 * still a shipped-from-abroad listing are included, and the totals are computed
 * from what was actually found.
 */
export async function placePurchaseOrder(
  _prev: PurchaseState,
  fd: FormData,
): Promise<PurchaseState> {
  const admin = await requireAdmin();

  const itemIds = str(fd, "itemIds").split(",").map((s) => s.trim()).filter(Boolean);
  if (itemIds.length === 0) return { error: "Nothing to order." };

  const items = await prisma.orderItem.findMany({
    where: { id: { in: itemIds }, purchaseOrderId: null },
    select: {
      id: true,
      orderId: true,
      quantity: true,
      unitPrice: true,
      product: { select: { vendorId: true, forwarderId: true, forwarderRouteId: true } },
    },
  });
  if (items.length === 0) {
    return { error: "Those lines have already been ordered — reload the queue." };
  }

  const first = items[0].product;
  const covered = new Set(items.map((i) => i.orderId)).size;
  const totalCost = Math.round(
    items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 100,
  ) / 100;
  const totalCbm = Math.round(Number(str(fd, "totalCbm")) * 1_000_000) / 1_000_000;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchaseOrder.create({
        data: {
          reference: reference(),
          supplierName: str(fd, "supplierName").slice(0, 200),
          supplierUrl: str(fd, "supplierUrl").slice(0, 2000),
          supplierContact: str(fd, "supplierContact").slice(0, 200),
          vendorId: first.vendorId || null,
          forwarderId: str(fd, "forwarderId") || first.forwarderId || null,
          routeId: str(fd, "routeId") || first.forwarderRouteId || null,
          status: "placed",
          totalCbm: Number.isFinite(totalCbm) && totalCbm > 0 ? totalCbm : 0,
          totalCost,
          note: str(fd, "note").slice(0, 1000),
          placedAt: new Date(),
          placedById: admin.id,
        },
      });

      // Scoped to lines that are still free. Two admins pressing the button at
      // once means the second one attaches nothing rather than stealing lines
      // from the first.
      await tx.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) }, purchaseOrderId: null },
        data: { purchaseOrderId: purchase.id },
      });

      return purchase;
    });

    // The order is now "ordered from the supplier" — the stage nobody
    // confirms by hand, because placing the purchase *is* the confirmation.
    await confirmStageForOrders(await orderIdsForItems(items.map((i) => i.id)), "processing");

    revalidatePurchasing();
    return { ok: true, reference: created.reference, purchaseId: created.id, orders: covered };
  } catch {
    return { error: "Couldn't record that purchase." };
  }
}

/**
 * Move a purchase along: received by the forwarder, or cancelled.
 *
 * Cancelling releases its lines back into the queue — the goods were never
 * bought, so they are still waiting to be.
 */
export async function updatePurchaseStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !(PURCHASE_STATUSES as readonly string[]).includes(status)) return;

  // Read the orders before cancelling detaches the lines that name them.
  const covered = await orderIdsForPurchase(id);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({ where: { id }, data: { status } });
    if (status === "cancelled") {
      await tx.orderItem.updateMany({
        where: { purchaseOrderId: id },
        data: { purchaseOrderId: null },
      });
    }
  }).catch(() => {});

  // The forwarder has the parcel: the next milestone on the buyer's timeline,
  // and the admin confirming it here is the only person who knows.
  if (status === "received") await confirmStageForOrders(covered, "at_forwarder");

  // Cancelling says the goods were never bought, so the orders it covered
  // have to stop reading "ordered from the supplier". Without this they sat
  // in transit on the tracker while their lines were back in the buy queue.
  if (status === "cancelled") await rollBackPlacement(covered);

  revalidatePurchasing();
}
