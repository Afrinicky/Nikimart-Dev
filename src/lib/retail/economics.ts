import "server-only";
import { prisma } from "@/lib/prisma";
import { bucketSize, dayKey, type OverviewWindow } from "@/lib/data-bundles/overview-window";
import { deriveStage, type FulfilmentStage } from "@/lib/retail/fulfilment";

/**
 * What each order actually made.
 *
 * The console could say what an order sold for and never what it cost, so
 * "revenue" was the only word it had and revenue is not income. The two ways
 * the mall makes money are not the same arithmetic and could not be added up
 * together until both were written down:
 *
 *   - **Goods Nickimart buys.** An imported line is bought from a supplier and
 *     resold. What it made is the gap between the two, and the cost side of
 *     that gap lives on the purchase record — which is why the procurement
 *     fields had to exist before this could.
 *   - **Goods a shop owns.** Nickimart never buys these, so there is no gap.
 *     What it makes is the commission snapshotted on the line at sale time.
 *
 * `gross` is the two of those added up, before the affiliate who referred the
 * sale is paid. `net` is after. A seller-funded affiliate commission is left
 * out of `net` deliberately: it comes out of the shop's share, so counting it
 * as a cost to Nickimart would be charging the same money twice.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Orders that represent real trade: paid for, and not cancelled. */
const TRADED = { status: { in: ["paid", "shipped", "delivered"] } };

/**
 * What a purchase is taken to have cost, in GH₵.
 *
 * The supplier's own price first, because that is the number on the invoice.
 * Failing that, what has actually been paid out. Failing both, what the goods
 * were worth at the prices the buyers paid — which makes the margin read zero
 * rather than inventing one, and is the honest answer for a purchase nobody
 * has recorded the money for yet.
 */
export function purchaseCostBasis(p: {
  supplierCost: number;
  fxRate: number;
  amountPaid: number;
  totalCost: number;
}): number {
  if (p.supplierCost > 0) return round2(p.supplierCost * (p.fxRate > 0 ? p.fxRate : 1));
  if (p.amountPaid > 0) return round2(p.amountPaid);
  return round2(p.totalCost);
}

export interface OrderEconomics {
  id: string;
  orderNumber: string;
  createdAt: Date;
  buyerName: string;
  stage: FulfilmentStage;
  status: string;
  /** What the goods sold for on Nickimart. */
  selling: number;
  /** What those goods cost — the supplier's price, or the selling price where a shop owns them. */
  cost: number;
  /** Selling less cost, plus the commission on shop-owned lines. Before the affiliate. */
  gross: number;
  /** The affiliate's own earnings on this order, whoever funds them. */
  affiliate: number;
  /** The part of that which comes out of Nickimart rather than the shop. */
  affiliateCost: number;
  /** Gross less what Nickimart funds of the affiliate's commission. */
  net: number;
  /** Shipping the buyer was charged, and what of it is still owed. */
  shipping: number;
  outstanding: number;
  /** True when every line was bought from a supplier abroad. */
  imported: boolean;
  affiliateName: string;
  shopNames: string[];
  /** The purchases behind the cost figure, for the row to link to. */
  purchases: { id: string; reference: string }[];
}

interface EconomicsRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  deliveryFee: number;
  balanceDue: number;
  hasAbroadItems: boolean;
  affiliate: { name: string } | null;
  user: { name: string | null; email: string };
  shipment: {
    processingAt: Date | null;
    forwarderReceivedAt: Date | null;
    transitAt: Date | null;
    arrivedGhanaAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  items: {
    quantity: number;
    unitPrice: number;
    commissionRate: number;
    affiliateCommission: number;
    affiliateFundedBy: string;
    purchaseOrderId: string | null;
    purchaseOrder: {
      id: string;
      reference: string;
      supplierCost: number;
      fxRate: number;
      amountPaid: number;
      totalCost: number;
      status: string;
    } | null;
    product: { vendor: { businessName: string } | null };
  }[];
}

const SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  status: true,
  deliveryFee: true,
  balanceDue: true,
  hasAbroadItems: true,
  affiliate: { select: { name: true } },
  user: { select: { name: true, email: true } },
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
  items: {
    select: {
      quantity: true,
      unitPrice: true,
      commissionRate: true,
      affiliateCommission: true,
      affiliateFundedBy: true,
      purchaseOrderId: true,
      purchaseOrder: {
        select: {
          id: true,
          reference: true,
          supplierCost: true,
          fxRate: true,
          amountPaid: true,
          totalCost: true,
          status: true,
        },
      },
      product: { select: { vendor: { select: { businessName: true } } } },
    },
  },
} as const;

/**
 * One order's economics.
 *
 * A purchase usually covers several lines, so its cost is shared out between
 * them in proportion to what each sold for. Pro-rata rather than per-unit,
 * because a parcel holds different goods at different prices and splitting it
 * by unit count would load the cost of a phone onto a phone case.
 */
function toEconomics(o: EconomicsRow, costShare: Map<string, number>): OrderEconomics {
  let selling = 0;
  let cost = 0;
  let gross = 0;
  let affiliate = 0;
  let affiliateCost = 0;
  const purchases = new Map<string, string>();

  for (const item of o.items) {
    const value = item.unitPrice * item.quantity;
    selling += value;
    affiliate += item.affiliateCommission;
    if (item.affiliateFundedBy === "platform") affiliateCost += item.affiliateCommission;

    const purchase = item.purchaseOrder;
    // A cancelled purchase bought nothing, so it cannot be what the goods
    // cost — the line falls back to the commission case until it is re-bought.
    if (purchase && purchase.status !== "cancelled") {
      purchases.set(purchase.id, purchase.reference);
      const basis = purchaseCostBasis(purchase);
      const share = costShare.get(purchase.id) ?? 0;
      const lineCost = share > 0 ? (basis * value) / share : basis;
      cost += lineCost;
      gross += value - lineCost;
    } else {
      // A shop owns these, so Nickimart never bought them: the cost and the
      // selling price are the same figure and the income is the commission.
      cost += value;
      gross += (value * item.commissionRate) / 100;
    }
  }

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    buyerName: o.user.name?.trim() || o.user.email,
    stage: deriveStage({
      status: o.status,
      shipment: o.shipment,
      placed: o.items.some((i) => i.purchaseOrderId),
    }),
    status: o.status,
    selling: round2(selling),
    cost: round2(cost),
    gross: round2(gross),
    affiliate: round2(affiliate),
    affiliateCost: round2(affiliateCost),
    net: round2(gross - affiliateCost),
    shipping: round2(o.deliveryFee),
    outstanding: round2(Math.max(0, o.balanceDue)),
    imported: o.hasAbroadItems,
    affiliateName: o.affiliate?.name ?? "",
    shopNames: [
      ...new Set(o.items.map((i) => i.product.vendor?.businessName).filter(Boolean)),
    ] as string[],
    purchases: [...purchases].map(([id, reference]) => ({ id, reference })),
  };
}

/**
 * The total each purchase's lines sold for, across every order it touches.
 *
 * Read once for the whole set rather than per order: a purchase is shared
 * between orders, and sharing its cost out needs the whole denominator, which
 * no single order can see.
 */
async function costShares(purchaseIds: string[]): Promise<Map<string, number>> {
  const share = new Map<string, number>();
  if (purchaseIds.length === 0) return share;
  const lines = await prisma.orderItem
    .findMany({
      where: { purchaseOrderId: { in: purchaseIds } },
      select: { purchaseOrderId: true, quantity: true, unitPrice: true },
    })
    .catch(() => []);
  for (const l of lines) {
    if (!l.purchaseOrderId) continue;
    share.set(l.purchaseOrderId, (share.get(l.purchaseOrderId) ?? 0) + l.unitPrice * l.quantity);
  }
  return share;
}

export interface EconomicsTotals {
  orders: number;
  selling: number;
  cost: number;
  gross: number;
  affiliate: number;
  affiliateCost: number;
  net: number;
  shipping: number;
  outstanding: number;
  /** Gross as a percentage of what was sold. */
  margin: number;
}

export function sumEconomics(rows: OrderEconomics[]): EconomicsTotals {
  const t = rows.reduce(
    (acc, r) => ({
      orders: acc.orders + 1,
      selling: acc.selling + r.selling,
      cost: acc.cost + r.cost,
      gross: acc.gross + r.gross,
      affiliate: acc.affiliate + r.affiliate,
      affiliateCost: acc.affiliateCost + r.affiliateCost,
      net: acc.net + r.net,
      shipping: acc.shipping + r.shipping,
      outstanding: acc.outstanding + r.outstanding,
    }),
    {
      orders: 0,
      selling: 0,
      cost: 0,
      gross: 0,
      affiliate: 0,
      affiliateCost: 0,
      net: 0,
      shipping: 0,
      outstanding: 0,
    },
  );
  return {
    orders: t.orders,
    selling: round2(t.selling),
    cost: round2(t.cost),
    gross: round2(t.gross),
    affiliate: round2(t.affiliate),
    affiliateCost: round2(t.affiliateCost),
    net: round2(t.net),
    shipping: round2(t.shipping),
    outstanding: round2(t.outstanding),
    margin: t.selling > 0 ? Math.round((t.gross / t.selling) * 1000) / 10 : 0,
  };
}

/** Every traded order in the window, with what it made. Newest first. */
export async function getOrderEconomics(w: OverviewWindow): Promise<OrderEconomics[]> {
  const rows = (await prisma.order.findMany({
    where: {
      ...TRADED,
      createdAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end },
    },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  })) as EconomicsRow[];

  const purchaseIds = [
    ...new Set(rows.flatMap((o) => o.items.map((i) => i.purchaseOrderId).filter(Boolean))),
  ] as string[];
  const share = await costShares(purchaseIds);
  return rows.map((o) => toEconomics(o, share));
}

/** The window's economics as one set of figures. */
export async function getEconomicsTotals(w: OverviewWindow): Promise<EconomicsTotals> {
  return sumEconomics(await getOrderEconomics(w));
}


export interface EconomicsPoint {
  day: string;
  endDay?: string;
  orders: number;
  selling: number;
  gross: number;
  net: number;
}

/**
 * The window's income as a series, including the stretches that sold nothing.
 *
 * The empty buckets matter: a trend drawn only through the days that traded
 * compresses a quiet week into a single point and turns a dip into a plateau.
 * Long windows are bucketed into weeks or months, because a mark too narrow
 * to hover is texture rather than data.
 */
export function economicsSeries(
  rows: OrderEconomics[],
  w: OverviewWindow,
): EconomicsPoint[] {
  const start =
    w.start ??
    (rows.length > 0 ? startOfDay(rows[rows.length - 1].createdAt) : null);
  if (!start) return [];

  const span = Math.max(1, Math.round((w.end.getTime() - start.getTime()) / 86_400_000));
  const size = bucketSize(span);
  const count = Math.ceil(span / size);

  const last = new Date(w.end);
  last.setDate(last.getDate() - 1);

  const buckets: EconomicsPoint[] = Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * size);
    const to = new Date(from);
    to.setDate(from.getDate() + size - 1);
    return {
      day: dayKey(from),
      ...(size > 1 ? { endDay: dayKey(to > last ? last : to) } : {}),
      orders: 0,
      selling: 0,
      gross: 0,
      net: 0,
    };
  });

  for (const row of rows) {
    const offset = Math.floor((startOfDay(row.createdAt).getTime() - start.getTime()) / 86_400_000);
    const point = buckets[Math.floor(offset / size)];
    if (!point) continue;
    point.orders += 1;
    point.selling = round2(point.selling + row.selling);
    point.gross = round2(point.gross + row.gross);
    point.net = round2(point.net + row.net);
  }
  return buckets;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Income by shop, biggest first — who is actually worth having on the mall. */
export function economicsByShop(
  rows: OrderEconomics[],
): { key: string; label: string; selling: number; net: number; orders: number }[] {
  const byShop = new Map<string, { selling: number; net: number; orders: number }>();
  for (const row of rows) {
    // An order spanning two shops is counted to both: the alternative is to
    // split it on a basis this figure does not carry, and a shop that appears
    // in half the orders should read as having been in half the orders.
    const shops = row.shopNames.length > 0 ? row.shopNames : ["No shop"];
    for (const shop of shops) {
      const at = byShop.get(shop) ?? { selling: 0, net: 0, orders: 0 };
      at.selling += row.selling / shops.length;
      at.net += row.net / shops.length;
      at.orders += 1;
      byShop.set(shop, at);
    }
  }
  return [...byShop]
    .map(([label, v]) => ({
      key: label,
      label,
      selling: round2(v.selling),
      net: round2(v.net),
      orders: v.orders,
    }))
    .sort((a, b) => b.net - a.net);
}
