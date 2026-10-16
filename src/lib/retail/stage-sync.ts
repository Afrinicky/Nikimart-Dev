import "server-only";
import { prisma } from "@/lib/prisma";
import { syncAffiliateCommissions } from "@/lib/affiliate-ledger";
import {
  STAGE_COLUMN,
  deriveStatus,
  orderStatusForStage,
  stagesFor,
  type ShipmentRoute,
  type ShipmentStage,
  type ShipmentTimestamps,
} from "@/lib/tracking";

/**
 * Move an order's shipment to a stage because something else happened.
 *
 * The buyer's timeline was only ever advanced by somebody pressing a confirm
 * button. That left the one transition nobody presses — the order being bought
 * from the supplier — invisible: an admin placed a purchase, and the order it
 * covered still read exactly as it had the day it was paid for. So placement
 * stamps the stage itself, and the forwarder's receipt stamps the next one.
 *
 * The same back-fill rule as a manual confirmation: confirming a later stage
 * fills in the earlier ones, because a parcel at a forwarder was necessarily
 * ordered first. Stages that do not exist on this order's route are skipped —
 * nothing should be able to mark a parcel crossing Accra "at the forwarder".
 *
 * Quiet by design: a purchase that has been recorded must not be rolled back
 * because one of its orders had no shipment row yet.
 */
export async function confirmStageForOrders(
  orderIds: string[],
  stage: ShipmentStage,
): Promise<void> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return;

  const shipments = await prisma.shipment
    .findMany({
      where: { orderId: { in: ids } },
      select: {
        id: true,
        orderId: true,
        processingAt: true,
        forwarderReceivedAt: true,
        transitAt: true,
        arrivedGhanaAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
        order: { select: { status: true, hasAbroadItems: true } },
      },
    })
    .catch(() => []);

  for (const shipment of shipments) {
    // A cancelled order is not fulfilled by anything happening elsewhere.
    if (shipment.order.status === "cancelled") continue;

    const route: ShipmentRoute = shipment.order.hasAbroadItems ? "abroad" : "domestic";
    const stages = stagesFor(route);
    const target = stages.indexOf(stage);
    if (target < 0) continue;

    const ts: ShipmentTimestamps = {
      processingAt: shipment.processingAt,
      transitAt: shipment.transitAt,
      outForDeliveryAt: shipment.outForDeliveryAt,
      deliveredAt: shipment.deliveredAt,
      forwarderReceivedAt: shipment.forwarderReceivedAt,
      arrivedGhanaAt: shipment.arrivedGhanaAt,
    };

    const now = new Date();
    const data: Record<string, unknown> = {};
    stages.forEach((s, i) => {
      if (i <= target && !ts[STAGE_COLUMN[s]]) {
        data[STAGE_COLUMN[s]] = now;
        ts[STAGE_COLUMN[s]] = now;
      }
    });
    // Already at or past this stage — nothing to say.
    if (Object.keys(data).length === 0) continue;

    const status = deriveStatus(ts, route);
    data.status = status;

    await prisma.shipment.update({ where: { id: shipment.id }, data }).catch(() => undefined);
    await prisma.order
      .update({ where: { id: shipment.orderId }, data: { status: orderStatusForStage(status) } })
      .catch(() => undefined);
    await syncAffiliateCommissions(shipment.orderId).catch(() => undefined);
  }
}

/**
 * Take a consignment back off the stages a purchase put it on.
 *
 * Cancelling a purchase says the goods were never bought, so an order it
 * covered has to stop reading "ordered from the supplier" — otherwise the
 * order sits in transit on the tracker while its line is back in the buy
 * queue, which is the contradiction that made both screens untrustworthy.
 *
 * Only the two stages a purchase is responsible for are cleared, and only
 * when nothing beyond them has been confirmed. Once freight has said the
 * consignment left, somebody with eyes on it has contradicted the
 * cancellation, and a bookkeeping correction is not the thing to resolve that
 * — so the stamps stay and the caller is told, by a `false` return, that this
 * one needs a person.
 */
export async function rollBackPlacement(orderIds: string[]): Promise<{ rolledBack: string[]; kept: string[] }> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  const out = { rolledBack: [] as string[], kept: [] as string[] };
  if (ids.length === 0) return out;

  const shipments = await prisma.shipment
    .findMany({
      where: { orderId: { in: ids } },
      select: {
        id: true,
        orderId: true,
        processingAt: true,
        forwarderReceivedAt: true,
        transitAt: true,
        arrivedGhanaAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
        order: { select: { status: true, hasAbroadItems: true } },
      },
    })
    .catch(() => []);

  for (const shipment of shipments) {
    if (shipment.order.status === "cancelled") continue;
    // Somebody has confirmed it moving since. Not ours to undo.
    if (
      shipment.transitAt ||
      shipment.arrivedGhanaAt ||
      shipment.outForDeliveryAt ||
      shipment.deliveredAt
    ) {
      out.kept.push(shipment.orderId);
      continue;
    }
    if (!shipment.processingAt && !shipment.forwarderReceivedAt) continue;

    const route: ShipmentRoute = shipment.order.hasAbroadItems ? "abroad" : "domestic";
    const ts: ShipmentTimestamps = {
      processingAt: null,
      transitAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      forwarderReceivedAt: null,
      arrivedGhanaAt: null,
    };

    await prisma.shipment
      .update({
        where: { id: shipment.id },
        data: { processingAt: null, forwarderReceivedAt: null, status: deriveStatus(ts, route) },
      })
      .catch(() => undefined);
    await prisma.order
      .update({ where: { id: shipment.orderId }, data: { status: "paid" } })
      .catch(() => undefined);
    await syncAffiliateCommissions(shipment.orderId).catch(() => undefined);
    out.rolledBack.push(shipment.orderId);
  }

  return out;
}

/** The orders a set of purchased lines belongs to. */
export async function orderIdsForItems(itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const rows = await prisma.orderItem
    .findMany({ where: { id: { in: itemIds } }, select: { orderId: true } })
    .catch(() => []);
  return [...new Set(rows.map((r) => r.orderId))];
}

/** The orders a purchase covers. */
export async function orderIdsForPurchase(purchaseId: string): Promise<string[]> {
  const rows = await prisma.orderItem
    .findMany({ where: { purchaseOrderId: purchaseId }, select: { orderId: true } })
    .catch(() => []);
  return [...new Set(rows.map((r) => r.orderId))];
}
