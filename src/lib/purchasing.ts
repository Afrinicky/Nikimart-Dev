import "server-only";
import { prisma } from "@/lib/prisma";
import { ABROAD_TYPES, parseAbroadTerms } from "@/lib/abroad";
import {
  billableCbm,
  describeRoute,
  freightModeLabel,
  ORDER_FREQUENCY_LABELS,
  type ForwarderRoute,
} from "@/lib/shipping";

/**
 * When is it time to place the international orders?
 *
 * Nothing answered that before, and it is the question the whole imported side
 * of the business turns on. A customer pays for one pair of shoes; no forwarder
 * will ship one pair of shoes. So the line waits — and what it waits for is
 * *other lines going to the same supplier*, because a supplier who sells shoes
 * also sells bags and sandals, and everything bought from them on one day is
 * packed into one parcel and consolidated once.
 *
 * A queue entry is therefore one supplier, on one lane, for one seller: the
 * unit of work that becomes a single purchase and a single parcel. It is ready
 * when its volume clears the forwarder's minimum for that lane, and it is due
 * when that lane's order frequency next comes round. Either is enough of a
 * reason to buy; neither is a reason to buy a single shoe.
 *
 * Only an admin places an order. A seller sees the same table for their own
 * shop and cannot act on it.
 */

/** Order states whose lines are real commitments waiting to be bought. */
const LIVE_STATUSES = ["paid", "shipped"] as const;

export interface QueueLine {
  orderItemId: string;
  orderNumber: string;
  orderedAt: Date;
  productId: string;
  productSlug: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** The volume this line adds to the parcel, levy included. */
  cbm: number;
  buyerName: string;
}

export interface QueueGroup {
  key: string;
  /** Who it is bought from, and how to get to the exact item. */
  supplierName: string;
  supplierUrl: string;
  supplierContact: string;
  vendorId: string;
  vendorName: string;
  forwarderId: string | null;
  forwarderName: string;
  routeId: string | null;
  routeLabel: string;
  modeLabel: string;
  /** The forwarder's Ghana warehouse this parcel is bound for. */
  destinationName: string;
  /** What the forwarder will not ship under, in cubic metres. 0 = no minimum. */
  minCbm: number;
  /** Everything waiting, added up. */
  totalCbm: number;
  totalUnits: number;
  /** What the goods will cost at the prices the buyers paid. */
  goodsValue: number;
  /** True when the volume clears the forwarder's minimum. */
  thresholdMet: boolean;
  /** How often purchases go out on this lane, in words. Blank when unset. */
  schedule: string;
  /** The next date this lane is due to be ordered on. Null when unscheduled. */
  dueAt: Date | null;
  /** True when that date has arrived. */
  scheduleDue: boolean;
  /** The oldest line in the group — how long somebody has been waiting. */
  waitingSince: Date;
  lines: QueueLine[];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundCbm(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * The next date a lane is due to be ordered on.
 *
 * Weekly and fortnightly are counted from the oldest line waiting, because that
 * is the clock a customer actually experiences: they ordered, and a week later
 * it should have been bought. Monthly and named dates are calendar-based, which
 * is how a forwarder's sailing schedule works.
 */
export function nextOrderDate(
  route: Pick<ForwarderRoute, "orderFrequency" | "orderFrequencyDetail"> | null,
  waitingSince: Date,
  now: Date = new Date(),
): Date | null {
  if (!route?.orderFrequency) return null;
  const day = 24 * 60 * 60 * 1000;

  if (route.orderFrequency === "weekly") return new Date(waitingSince.getTime() + 7 * day);
  if (route.orderFrequency === "biweekly") return new Date(waitingSince.getTime() + 14 * day);

  if (route.orderFrequency === "monthly") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // Named days of the month: "1, 15". The next one that has not passed, else
  // the first of them next month.
  const days = route.orderFrequencyDetail
    .split(/[^0-9]+/)
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const upcoming = days.find((d) => d >= now.getDate());
  return upcoming
    ? new Date(now.getFullYear(), now.getMonth(), upcoming)
    : new Date(now.getFullYear(), now.getMonth() + 1, days[0]);
}

/** "Weekly", "Set dates (1, 15)" — how a lane's schedule reads. */
export function describeSchedule(
  route: Pick<ForwarderRoute, "orderFrequency" | "orderFrequencyDetail"> | null,
): string {
  const f = route?.orderFrequency;
  if (!f) return "";
  const label = ORDER_FREQUENCY_LABELS[f as keyof typeof ORDER_FREQUENCY_LABELS] ?? "";
  if (!label) return "";
  return f === "dates" && route?.orderFrequencyDetail
    ? `${label} (${route.orderFrequencyDetail})`
    : label;
}

/**
 * Everything bought and not yet ordered from a supplier, grouped.
 *
 * Pass a `vendorId` for a seller's own view of the same queue.
 */
export async function getPurchaseQueue(vendorId?: string): Promise<QueueGroup[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      purchaseOrderId: null,
      order: { status: { in: [...LIVE_STATUSES] } },
      product: {
        productType: { in: [...ABROAD_TYPES] },
        supplierDelivers: false,
        ...(vendorId ? { vendorId } : {}),
      },
    },
    orderBy: { order: { createdAt: "asc" } },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      freightRouteId: true,
      order: {
        select: {
          orderNumber: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      },
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          categoryId: true,
          cbm: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          shippingWeightKg: true,
          preorderInfo: true,
          sourceUrl: true,
          supplierName: true,
          supplierContact: true,
          forwarderId: true,
          forwarderRouteId: true,
          vendorId: true,
          vendor: { select: { businessName: true } },
        },
      },
    },
  });

  if (items.length === 0) return [];

  const forwarders = await prisma.freightForwarder.findMany({
    include: {
      routes: { include: { destinationPoint: { select: { name: true, city: true } } } },
    },
  });
  const forwarderById = new Map(forwarders.map((f) => [f.id, f]));

  const now = new Date();
  const groups = new Map<string, QueueGroup>();

  for (const item of items) {
    const p = item.product;
    const terms = parseAbroadTerms(p.preorderInfo);

    const supplierUrl = terms?.sourceUrl || p.sourceUrl || "";
    const supplierName = terms?.supplierName || p.supplierName || "Unnamed supplier";
    const supplierContact = terms?.supplierContact || p.supplierContact || "";

    const forwarderId = terms?.forwarderId || p.forwarderId || null;
    const forwarder = forwarderId ? forwarderById.get(forwarderId) : undefined;
    const routeId = item.freightRouteId || terms?.routeId || p.forwarderRouteId || null;
    const route = forwarder?.routes.find((r) => r.id === routeId) ?? null;

    // The volume this line adds — the same figure the freight was quoted on,
    // so the threshold is measured in the units the forwarder actually bills.
    // Levies live in the rate, not in the volume, so nothing about the classes
    // this item falls into changes the cubic metres it takes up in a container.
    const cbm = billableCbm(
      {
        cbm: p.cbm,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        shippingWeightKg: p.shippingWeightKg,
      },
      item.quantity,
    );

    // One supplier, one lane, one seller: the unit that becomes one parcel.
    const key = [p.vendorId, supplierUrl || supplierName, forwarderId ?? "", routeId ?? ""].join("::");

    const line: QueueLine = {
      orderItemId: item.id,
      orderNumber: item.order.orderNumber,
      orderedAt: item.order.createdAt,
      productId: p.id,
      productSlug: p.slug,
      productName: p.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cbm,
      buyerName: item.order.user?.name || item.order.user?.email || "Customer",
    };

    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.totalCbm = roundCbm(existing.totalCbm + cbm);
      existing.totalUnits += item.quantity;
      existing.goodsValue = round(existing.goodsValue + item.unitPrice * item.quantity);
      if (item.order.createdAt < existing.waitingSince) existing.waitingSince = item.order.createdAt;
      continue;
    }

    const destination = route?.destinationPoint;
    groups.set(key, {
      key,
      supplierName,
      supplierUrl,
      supplierContact,
      vendorId: p.vendorId,
      vendorName: p.vendor?.businessName ?? "Shop",
      forwarderId,
      forwarderName: forwarder?.name ?? "No forwarder",
      routeId,
      routeLabel: route ? describeRoute({ name: route.name, mode: route.mode }) : "No route",
      modeLabel: route ? freightModeLabel(route.mode) : "",
      destinationName: destination
        ? `${destination.name}${destination.city ? `, ${destination.city}` : ""}`
        : "",
      minCbm: route?.minCbm ?? 0,
      totalCbm: cbm,
      totalUnits: item.quantity,
      goodsValue: round(item.unitPrice * item.quantity),
      thresholdMet: false,
      schedule: describeSchedule(route),
      dueAt: null,
      scheduleDue: false,
      waitingSince: item.order.createdAt,
      lines: [line],
    });
  }

  const out = [...groups.values()].map((g) => {
    const route =
      g.forwarderId && g.routeId
        ? (forwarderById.get(g.forwarderId)?.routes.find((r) => r.id === g.routeId) ?? null)
        : null;
    const dueAt = nextOrderDate(route, g.waitingSince, now);
    return {
      ...g,
      // No minimum set means the forwarder will take whatever there is.
      thresholdMet: g.minCbm <= 0 || g.totalCbm >= g.minCbm,
      dueAt,
      scheduleDue: dueAt !== null && dueAt.getTime() <= now.getTime(),
    };
  });

  // Ready first, then the ones closest to their threshold: the top of this list
  // is always the next thing worth doing.
  return out.sort((a, b) => {
    const readyA = a.thresholdMet || a.scheduleDue;
    const readyB = b.thresholdMet || b.scheduleDue;
    if (readyA !== readyB) return readyA ? -1 : 1;
    const shareA = a.minCbm > 0 ? a.totalCbm / a.minCbm : 1;
    const shareB = b.minCbm > 0 ? b.totalCbm / b.minCbm : 1;
    if (shareA !== shareB) return shareB - shareA;
    return a.waitingSince.getTime() - b.waitingSince.getTime();
  });
}

export interface PurchaseRecord {
  id: string;
  reference: string;
  supplierName: string;
  supplierUrl: string;
  supplierContact: string;
  vendorName: string;
  forwarderName: string;
  routeLabel: string;
  status: string;
  totalCbm: number;
  totalCost: number;
  note: string;
  placedAt: Date | null;
  placedBy: string;
  createdAt: Date;
  itemCount: number;
  units: number;
}

export const PURCHASE_STATUSES = ["placed", "received", "cancelled"] as const;

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  placed: "Ordered from supplier",
  received: "Received by forwarder",
  cancelled: "Cancelled",
};

/** Purchases already placed. A seller sees only their own. */
export async function getPurchaseOrders(vendorId?: string): Promise<PurchaseRecord[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: vendorId ? { vendorId } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      vendor: { select: { businessName: true } },
      forwarder: { select: { name: true } },
      route: { select: { name: true, mode: true } },
      placedBy: { select: { name: true, email: true } },
      items: { select: { quantity: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    supplierName: r.supplierName,
    supplierUrl: r.supplierUrl,
    supplierContact: r.supplierContact,
    vendorName: r.vendor?.businessName ?? "—",
    forwarderName: r.forwarder?.name ?? "—",
    routeLabel: r.route ? describeRoute({ name: r.route.name, mode: r.route.mode }) : "—",
    status: r.status,
    totalCbm: r.totalCbm,
    totalCost: r.totalCost,
    note: r.note,
    placedAt: r.placedAt,
    placedBy: r.placedBy?.name || r.placedBy?.email || "",
    createdAt: r.createdAt,
    itemCount: r.items.length,
    units: r.items.reduce((s, i) => s + i.quantity, 0),
  }));
}
