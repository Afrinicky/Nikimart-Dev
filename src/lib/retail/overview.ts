import "server-only";
import { prisma } from "@/lib/prisma";
import {
  bucketSize,
  dayKey,
  previousRange as before,
  type OverviewWindow,
} from "@/lib/data-bundles/overview-window";
import { deriveStage, type FulfilmentStage } from "@/lib/retail/fulfilment";

/**
 * What the mall looks like over a window.
 *
 * The retail overview used to be a wall of all-time counts: how many users
 * have ever registered, how many products exist, GMV since the shop opened.
 * Every one of those only goes up, so nothing on the screen could tell an
 * admin whether this month was better or worse than the last — which is the
 * only question anybody opens an overview with.
 *
 * So this is the bundle console's overview, applied to the mall: everything
 * scoped to a window, compared against the window before it, and every figure
 * a link to the rows it was counted from. The window defaults to the current
 * month, because a shop's books are kept by the month and a rolling thirty
 * days straddles two of them.
 *
 * "Revenue" here is what buyers actually paid — `amountPaid`, not the order
 * total. Half of the mall's orders are settled in two parts, with the freight
 * due on collection, and counting the unpaid half as revenue would overstate
 * every month by whatever is still sitting in the balance column.
 */

export { changePercent } from "@/lib/data-bundles/overview";

/** The `createdAt` filter for a window. An open start means all time. */
function within(w: OverviewWindow) {
  return { createdAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end } };
}

/** Orders that represent real trade: paid for, and not cancelled. */
const TRADED = { status: { in: ["paid", "shipped", "delivered"] } };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export interface RetailTotals {
  orders: number;
  /** What buyers actually paid in the window. */
  revenue: number;
  /** What those orders are worth in full, outstanding balances included. */
  booked: number;
  /** Still owed on orders in the window — the goods-only plans. */
  outstanding: number;
  units: number;
  /** Average order value, on what was booked. */
  aov: number;
  /** Accounts that registered in the window. */
  newCustomers: number;
  /** Buyers who ordered in the window, however many times. */
  buyers: number;
  /** Commission the platform earned on the lines sold. */
  commission: number;
  previous?: {
    orders: number;
    revenue: number;
    booked: number;
    units: number;
    newCustomers: number;
    commission: number;
  };
}

interface TotalsRow {
  id: string;
  userId: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  items: { quantity: number; unitPrice: number; commissionRate: number }[];
}

function sumTotals(rows: TotalsRow[]) {
  let revenue = 0;
  let booked = 0;
  let outstanding = 0;
  let units = 0;
  let commission = 0;
  const buyers = new Set<string>();
  for (const o of rows) {
    revenue += o.amountPaid;
    booked += o.total;
    outstanding += Math.max(0, o.balanceDue);
    buyers.add(o.userId);
    for (const i of o.items) {
      units += i.quantity;
      commission += (i.unitPrice * i.quantity * i.commissionRate) / 100;
    }
  }
  return {
    orders: rows.length,
    revenue: round2(revenue),
    booked: round2(booked),
    outstanding: round2(outstanding),
    units,
    commission: round2(commission),
    buyers: buyers.size,
  };
}

export async function getRetailTotals(w: OverviewWindow): Promise<RetailTotals> {
  const previous = before(w);
  const select = {
    id: true,
    userId: true,
    total: true,
    amountPaid: true,
    balanceDue: true,
    items: { select: { quantity: true, unitPrice: true, commissionRate: true } },
  } as const;

  const [rows, newCustomers, previousRows, previousCustomers] = await Promise.all([
    prisma.order.findMany({ where: { ...TRADED, ...within(w) }, select }),
    prisma.user.count({ where: { role: "CUSTOMER", ...within(w) } }),
    previous
      ? prisma.order.findMany({ where: { ...TRADED, createdAt: previous }, select })
      : Promise.resolve(null),
    previous
      ? prisma.user.count({ where: { role: "CUSTOMER", createdAt: previous } })
      : Promise.resolve(null),
  ]);

  const now = sumTotals(rows);
  const past = previousRows ? sumTotals(previousRows) : null;

  return {
    ...now,
    aov: now.orders > 0 ? round2(now.booked / now.orders) : 0,
    newCustomers,
    ...(past && previousCustomers !== null
      ? {
          previous: {
            orders: past.orders,
            revenue: past.revenue,
            booked: past.booked,
            units: past.units,
            commission: past.commission,
            newCustomers: previousCustomers,
          },
        }
      : {}),
  };
}

export interface RetailDayPoint {
  day: string;
  endDay?: string;
  orders: number;
  revenue: number;
}

/**
 * The window as a series, including the stretches that sold nothing.
 *
 * The empty buckets matter: a trend drawn only through the days that traded
 * compresses a quiet week into a single point and makes a dip look like a
 * plateau. Long windows are bucketed into weeks or months rather than drawn as
 * hundreds of one-pixel days — the shape is the point, and a mark too narrow
 * to hover is texture rather than data.
 */
export async function getRetailSeries(w: OverviewWindow): Promise<RetailDayPoint[]> {
  const start = w.start ?? (await firstOrderDay());
  if (!start) return [];

  const span = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / 86_400_000));
  const size = bucketSize(span);
  const count = Math.ceil(span / size);

  const last = new Date(w.end);
  last.setDate(last.getDate() - 1);

  const buckets: RetailDayPoint[] = Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * size);
    const to = new Date(from);
    to.setDate(from.getDate() + size - 1);
    return {
      day: dayKey(from),
      ...(size > 1 ? { endDay: dayKey(to > last ? last : to) } : {}),
      orders: 0,
      revenue: 0,
    };
  });

  const rows = await prisma.order.findMany({
    where: { ...TRADED, createdAt: { gte: start, lt: w.end } },
    select: { createdAt: true, amountPaid: true },
  });

  for (const row of rows) {
    const offset = Math.floor((startOfDay(row.createdAt).getTime() - start.getTime()) / 86_400_000);
    const point = buckets[Math.floor(offset / size)];
    if (!point) continue;
    point.orders += 1;
    point.revenue = round2(point.revenue + row.amountPaid);
  }
  return buckets;
}

async function firstOrderDay(): Promise<Date | null> {
  const first = await prisma.order.findFirst({
    where: TRADED,
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return first ? startOfDay(first.createdAt) : null;
}

/** How the window's orders split across the fulfilment stages. */
export async function getStageMix(w: OverviewWindow): Promise<Record<FulfilmentStage, number>> {
  const rows = await prisma.order.findMany({
    where: within(w),
    select: {
      status: true,
      shipment: {
        select: {
          processingAt: true,
          forwarderReceivedAt: true,
          transitAt: true,
          arrivedGhanaAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
        },
      },
      items: { select: { purchaseOrderId: true } },
    },
  });

  const mix = {} as Record<FulfilmentStage, number>;
  for (const o of rows) {
    const stage = deriveStage({
      status: o.status,
      shipment: o.shipment,
      placed: o.items.some((i) => i.purchaseOrderId),
    });
    mix[stage] = (mix[stage] ?? 0) + 1;
  }
  return mix;
}

export interface MixRow {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
}

/** Revenue by category, biggest first. */
export async function getCategoryMix(w: OverviewWindow): Promise<MixRow[]> {
  const items = await prisma.orderItem.findMany({
    where: { order: { ...TRADED, ...within(w) } },
    select: {
      quantity: true,
      unitPrice: true,
      orderId: true,
      product: { select: { category: { select: { id: true, name: true, slug: true } } } },
    },
  });
  return collapse(items, (i) => {
    const c = i.product.category;
    return c ? { key: c.slug, label: c.name } : { key: "none", label: "Uncategorised" };
  });
}

/** Revenue by shop, biggest first. */
export async function getShopMix(w: OverviewWindow): Promise<MixRow[]> {
  const items = await prisma.orderItem.findMany({
    where: { order: { ...TRADED, ...within(w) } },
    select: {
      quantity: true,
      unitPrice: true,
      orderId: true,
      product: { select: { vendor: { select: { id: true, businessName: true } } } },
    },
  });
  return collapse(items, (i) => {
    const v = i.product.vendor;
    return v ? { key: v.id, label: v.businessName } : { key: "none", label: "No shop" };
  });
}

/** Revenue by product, biggest first. */
export async function getProductMix(w: OverviewWindow): Promise<MixRow[]> {
  const items = await prisma.orderItem.findMany({
    where: { order: { ...TRADED, ...within(w) } },
    select: {
      quantity: true,
      unitPrice: true,
      orderId: true,
      product: { select: { id: true, name: true, emoji: true } },
    },
  });
  return collapse(items, (i) => ({
    key: i.product.id,
    label: `${i.product.emoji ? `${i.product.emoji} ` : ""}${i.product.name}`,
  }));
}

function collapse<T extends { quantity: number; unitPrice: number; orderId: string }>(
  items: T[],
  group: (item: T) => { key: string; label: string },
): MixRow[] {
  const byKey = new Map<string, MixRow & { orderIds: Set<string> }>();
  for (const item of items) {
    const { key, label } = group(item);
    const row =
      byKey.get(key) ??
      ({ key, label, revenue: 0, orders: 0, units: 0, orderIds: new Set<string>() } as MixRow & {
        orderIds: Set<string>;
      });
    row.revenue = round2(row.revenue + item.unitPrice * item.quantity);
    row.units += item.quantity;
    row.orderIds.add(item.orderId);
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Where the sales came from.
 *
 * Two channels, because there are two: a buyer who found the mall, and a buyer
 * an affiliate brought. The second costs commission, so the split is the one
 * figure that says whether the affiliate programme is carrying the business or
 * being carried by it.
 */
export async function getChannelMix(
  w: OverviewWindow,
): Promise<{ key: string; label: string; revenue: number; orders: number }[]> {
  const rows = await prisma.order.findMany({
    where: { ...TRADED, ...within(w) },
    select: { amountPaid: true, affiliateId: true },
  });
  let direct = 0;
  let directOrders = 0;
  let referred = 0;
  let referredOrders = 0;
  for (const o of rows) {
    if (o.affiliateId) {
      referred = round2(referred + o.amountPaid);
      referredOrders += 1;
    } else {
      direct = round2(direct + o.amountPaid);
      directOrders += 1;
    }
  }
  return [
    { key: "direct", label: "Direct on Nickimart", revenue: direct, orders: directOrders },
    { key: "affiliate", label: "Through an affiliate", revenue: referred, orders: referredOrders },
  ].filter((r) => r.orders > 0 || r.key === "direct");
}

export interface RetailOperations {
  /** Checkouts nobody finished, in the window. */
  pendingPayment: number;
  cancelled: number;
  /** Paid orders whose goods have not been bought from a supplier yet. */
  toPlace: number;
  /** Ready for the buyer and waiting on them. */
  ready: number;
  /** Still owed on live orders, whenever they were placed. */
  outstanding: number;
  /** Shops waiting on verification, whenever they applied. */
  pendingShops: number;
  /**
   * Enquiries waiting on Nickimart, whenever raised.
   *
   * Exactly what the support queue counts, and deliberately not "every thread
   * about an order that isn't resolved": most threads are an affiliate
   * talking to their own buyer, which no admin can see, answer or close. The
   * dashboard used to count those, so resolving the enquiry an admin *could*
   * reach left the alert standing — the number never moved, whatever they
   * did, which is how an alert becomes wallpaper.
   */
  openThreads: number;
  /** Listings with no stock, so a buyer cannot have them. */
  outOfStock: number;
}

export async function getRetailOperations(w: OverviewWindow): Promise<RetailOperations> {
  const [pendingPayment, cancelled, live, pendingShops, openThreads, outOfStock] =
    await Promise.all([
      prisma.order.count({ where: { status: "pending", ...within(w) } }),
      prisma.order.count({ where: { status: "cancelled", ...within(w) } }),
      prisma.order.findMany({
        where: TRADED,
        select: {
          status: true,
          balanceDue: true,
          shipment: {
            select: {
              processingAt: true,
              forwarderReceivedAt: true,
              transitAt: true,
              arrivedGhanaAt: true,
              outForDeliveryAt: true,
              deliveredAt: true,
            },
          },
          items: { select: { purchaseOrderId: true } },
        },
      }),
      prisma.vendor.count({ where: { verificationStatus: "pending" } }),
      prisma.affiliateThread
        .count({ where: { kind: "support", status: { in: ["open", "waiting_support"] } } })
        .catch(() => 0),
      prisma.product.count({ where: { stockQuantity: { lte: 0 }, productType: "in_stock" } }),
    ]);

  let toPlace = 0;
  let ready = 0;
  let outstanding = 0;
  for (const o of live) {
    const stage = deriveStage({
      status: o.status,
      shipment: o.shipment,
      placed: o.items.some((i) => i.purchaseOrderId),
    });
    if (stage === "placing") toPlace += 1;
    if (stage === "ready") ready += 1;
    outstanding += Math.max(0, o.balanceDue);
  }

  return {
    pendingPayment,
    cancelled,
    toPlace,
    ready,
    outstanding: round2(outstanding),
    pendingShops,
    openThreads,
    outOfStock,
  };
}

/** The standing counts the mall is made of. Not window-scoped — they are "now". */
export async function getRetailStanding(): Promise<{
  customers: number;
  shops: number;
  products: number;
  activeProducts: number;
  affiliates: number;
  pickupPoints: number;
}> {
  const [customers, shops, products, activeProducts, affiliates, pickupPoints] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.vendor.count(),
    prisma.product.count(),
    prisma.product.count({ where: { stockQuantity: { gt: 0 } } }),
    prisma.affiliate.count({ where: { status: "active" } }),
    prisma.pickupPoint.count({ where: { isActive: true } }),
  ]);
  return { customers, shops, products, activeProducts, affiliates, pickupPoints };
}
