"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { normalizeGhPhone } from "@/lib/phone";
import { notifyTemplate } from "@/lib/messages";
import { notifyShipmentUpdate } from "@/lib/order-notifications";
import { syncAffiliateCommissions } from "@/lib/affiliate-ledger";
import {
  checkCollectionCode,
  issueCollectionCode,
  recordHandover,
} from "@/lib/pickup-collection";
import { STAGE_COLUMN, deriveStatus, orderStatusForStage, stagesFor } from "@/lib/tracking";
import type { ShipmentRoute, ShipmentTimestamps } from "@/lib/tracking";

/**
 * Handing a parcel over the counter.
 *
 * This replaces a button that marked an order collected on nothing but the
 * operator's word. It is the only way a pickup order reaches "collected" now,
 * and it will not get there without either the buyer's code or an admin
 * putting their name to an override — which is the whole point: the record of
 * who took the goods is written in the same breath as the goods going.
 *
 * Deliberately its own action rather than a branch inside confirmShipmentStage.
 * That function is a generic "this step happened" for six stages and five
 * roles; bending it around a code, a lock-out, an ID number and an override
 * reason would make the common path harder to read for the sake of one stage.
 */

export type ReleaseState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

const ID_TYPES = ["Ghana Card", "Passport", "Voter ID", "Driver's licence", "Other"] as const;

/** The order, with everything releasing it needs to check. */
async function loadForRelease(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      deliveryMethod: true,
      pickupPointId: true,
      hasAbroadItems: true,
      balanceDue: true,
      pickupPoint: { select: { id: true, name: true, locationName: true, operatorId: true } },
      user: { select: { name: true, phone: true, email: true } },
      shipment: {
        select: {
          id: true,
          processingAt: true,
          transitAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
          forwarderReceivedAt: true,
          arrivedGhanaAt: true,
        },
      },
    },
  });
}

/**
 * Whether this person may touch this parcel at all.
 *
 * An admin may release anything. A pickup operator may release only what is
 * routed to the point they run — which is the same ownership rule
 * confirmShipmentStage applies, restated here because this action does not go
 * through it.
 */
function mayRelease(
  role: string,
  userId: string,
  point: { operatorId: string | null } | null,
): boolean {
  if (role === "ADMIN") return true;
  if (role !== "PICKUP") return false;
  return Boolean(point && point.operatorId === userId);
}

/**
 * Send (or re-send) the buyer their collection code.
 *
 * Rate-limited per order rather than per operator: the thing worth preventing
 * is a counter texting somebody fifteen times, and that is a property of the
 * parcel, not of whoever is standing behind the till.
 */
export async function sendCollectionCode(
  _prev: ReleaseState,
  fd: FormData,
): Promise<ReleaseState> {
  const user = await requireUser();
  const orderId = str(fd, "orderId");
  if (!orderId) return { error: "Which order?" };

  const order = await loadForRelease(orderId);
  if (!order) return { error: "That order doesn't exist." };
  if (!mayRelease(user.role, user.id, order.pickupPoint)) {
    return { error: "This order isn't routed to your pickup point." };
  }
  if (order.shipment?.deliveredAt) return { error: "That order has already been collected." };

  const limit = await rateLimit(`pickup-code:${orderId}`, 5, 10 * 60_000);
  if (!limit.ok) {
    return {
      error: `That's five codes for this order in a few minutes. Please wait ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const result = await issueCollectionCode(orderId);
  if (!result.ok) return { error: result.message };

  revalidatePath("/pickup");
  revalidatePath("/admin/orders/pickups");
  return { ok: true, message: result.message };
}

/**
 * Release the parcel.
 *
 * The order of work matters and is not an accident:
 *
 *   1. Check who is asking, and that the parcel is theirs to release.
 *   2. Check the code (or, for an admin, the written override).
 *   3. Write the hand-over record.
 *   4. Only then mark the shipment collected.
 *
 * Any other order can produce an order marked collected with nothing to say
 * who collected it, which is the hole this exists to close. A failure at step
 * 3 leaves the parcel uncollected and the operator trying again, which is the
 * right way round — the goods are still on the shelf.
 */
export async function releaseParcel(_prev: ReleaseState, fd: FormData): Promise<ReleaseState> {
  const user = await requireUser();
  const orderId = str(fd, "orderId");
  if (!orderId) return { error: "Which order?" };

  const order = await loadForRelease(orderId);
  if (!order) return { error: "That order doesn't exist." };
  if (order.deliveryMethod !== "pickup") {
    return { error: "That order isn't being collected in person." };
  }
  if (!mayRelease(user.role, user.id, order.pickupPoint)) {
    return { error: "This order isn't routed to your pickup point." };
  }
  if (!order.shipment) return { error: "That order has no consignment to release." };
  if (order.shipment.deliveredAt) return { error: "That order has already been collected." };

  // Who is taking it. Required whichever way it is released: a parcel gone
  // with nobody's name against it is the thing we are fixing.
  const collectorName = str(fd, "collectorName");
  if (collectorName.length < 2) return { error: "Write down who is collecting it." };
  const collectorPhone = normalizeGhPhone(str(fd, "collectorPhone"));
  if (!collectorPhone) return { error: "A phone number for whoever is collecting, please." };

  const isBuyer = str(fd, "collectorRelation") === "buyer";
  const relation = isBuyer ? "buyer" : str(fd, "collectorRelationNote") || "Collecting on their behalf";

  const idType = str(fd, "collectorIdType");
  const idNumber = str(fd, "collectorIdNumber");
  // Somebody collecting for another person is exactly the case worth being able
  // to trace afterwards, so for them the ID is not optional.
  if (!isBuyer && (!idType || idNumber.length < 4)) {
    return { error: "Somebody collecting for the buyer has to show ID. Record its type and number." };
  }
  if (idType && !ID_TYPES.includes(idType as (typeof ID_TYPES)[number])) {
    return { error: "Choose an ID type from the list." };
  }

  const override = str(fd, "override") === "on";
  const overrideReason = str(fd, "overrideReason");

  if (override) {
    // An override is an admin saying, in writing, that they released goods
    // without the proof. A pickup operator cannot grant themselves that.
    if (user.role !== "ADMIN") {
      return { error: "Only an administrator can release a parcel without the code." };
    }
    if (overrideReason.length < 10) {
      return { error: "Say why this is being released without the code — it stays on the record." };
    }
  } else {
    // Slow down a counter working through codes. Per order, because that is
    // what an attacker would be attacking.
    const limit = await rateLimit(`pickup-release:${orderId}`, 10, 10 * 60_000);
    if (!limit.ok) {
      return { error: `Too many attempts on this order. Try again ${retryAfterLabel(limit.retryAfter)}.` };
    }
    const check = await checkCollectionCode(orderId, str(fd, "code"));
    if (check.outcome !== "ok") return { error: check.message };
  }

  const written = await recordHandover({
    orderId,
    pickupPointId: order.pickupPointId,
    method: override ? "override" : "code",
    collectorName,
    collectorPhone,
    collectorIdType: idType,
    collectorIdNumber: idNumber,
    collectorRelation: relation,
    overrideReason: override ? overrideReason : "",
    releasedById: user.id,
    releasedByName: user.name ?? user.email ?? user.id,
  });
  if (!written) {
    return { error: "Couldn't write the collection record, so the parcel hasn't been released. Try again." };
  }

  // Now, and only now, the consignment is collected. Back-filling earlier
  // stages matches confirmShipmentStage: a parcel handed over was plainly also
  // prepared and carried, whatever anybody remembered to tick.
  const route: ShipmentRoute = order.hasAbroadItems ? "abroad" : "domestic";
  const stages = stagesFor(route);
  const ts: ShipmentTimestamps = {
    processingAt: order.shipment.processingAt,
    transitAt: order.shipment.transitAt,
    outForDeliveryAt: order.shipment.outForDeliveryAt,
    deliveredAt: order.shipment.deliveredAt,
    forwarderReceivedAt: order.shipment.forwarderReceivedAt,
    arrivedGhanaAt: order.shipment.arrivedGhanaAt,
  };
  const now = new Date();
  const data: Record<string, unknown> = { manualHold: true };
  for (const s of stages) {
    if (!ts[STAGE_COLUMN[s]]) {
      data[STAGE_COLUMN[s]] = now;
      ts[STAGE_COLUMN[s]] = now;
    }
  }
  const status = deriveStatus(ts, route);
  data.status = status;

  await prisma.shipment.update({ where: { id: order.shipment.id }, data });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: orderStatusForStage(status) },
  });
  await syncAffiliateCommissions(order.id);

  const point = order.pickupPoint
    ? `${order.pickupPoint.name} — ${order.pickupPoint.locationName}`
    : "the pickup point";

  after(async () => {
    await notifyShipmentUpdate(order.id, "Collected", "delivered");
    // A buyer who did not come themselves is told who did, the moment it
    // happens. If it was not arranged by them, that text is the only chance
    // anybody has of catching it the same day.
    if (!isBuyer) {
      await notifyTemplate(order.user, "order.collected", {
        orderNumber: order.orderNumber,
        point,
        collector: collectorName,
      });
    }
  });

  for (const path of ["/orders", "/account", "/pickup", "/admin/orders", "/admin/orders/pickups"]) {
    revalidatePath(path);
  }
  return {
    ok: true,
    message: override
      ? `Released to ${collectorName} without a code. The override and your name are on the record.`
      : `Released to ${collectorName}. Code verified.`,
  };
}
