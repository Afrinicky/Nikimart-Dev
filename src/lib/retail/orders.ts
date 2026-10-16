import "server-only";
import { prisma } from "@/lib/prisma";
import { deriveStage, type FulfilmentStage, isFulfilmentStage } from "@/lib/retail/fulfilment";

/**
 * The orders table, and everything behind one row of it.
 *
 * The admin console could tell you an order existed and what it cost. It could
 * not tell you who bought it, where it was going, or how to reach them — which
 * made it a list of receipts rather than a worklist. Both reads here exist to
 * close that: the list carries who and how much is still owed, and the dossier
 * carries everything there is.
 *
 * The stage is derived (see `lib/retail/fulfilment`), so it cannot be filtered
 * in SQL. The query narrows on what the database does know — the order's own
 * status, and a search across the buyer and the order number — and the stage
 * filter and the page are applied to that. A mall's order book is thousands of
 * rows, not millions; paging in SQL over a column that does not exist would
 * cost a stored, duplicated status that could drift from the three records
 * that already know the answer.
 */

export const PAYMENT_FILTER_OPTIONS = [
  { value: "all", label: "All payments" },
  { value: "paid", label: "Paid in full" },
  { value: "part", label: "Part paid — balance due" },
  { value: "unpaid", label: "Unpaid" },
] as const;

export const METHOD_FILTER_OPTIONS = [
  { value: "all", label: "Pickup & delivery" },
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
] as const;

export function stageFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return value && isFulfilmentStage(value) ? value : "all";
}

export function paymentFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return PAYMENT_FILTER_OPTIONS.some((o) => o.value === value) ? value : "all";
}

export function methodFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return METHOD_FILTER_OPTIONS.some((o) => o.value === value) ? value : "all";
}

export const PER_PAGE_DEFAULT = 25;

export function perPageFrom(raw: string | undefined, fallback = PER_PAGE_DEFAULT): number {
  const n = Number(raw);
  return [10, 25, 50, 100].includes(n) ? n : fallback;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  /** "Red Nike Air ×2" and, where there are more, how many more. */
  itemSummary: string;
  itemCount: number;
  units: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  paymentPlan: string;
  deliveryMethod: string;
  route: "domestic" | "abroad";
  stage: FulfilmentStage;
  status: string;
  trackingNumber: string;
  affiliateName: string;
  shopNames: string[];
  /** Where it is going, in a few words. */
  destination: string;
}

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  status: true,
  total: true,
  amountPaid: true,
  balanceDue: true,
  paymentPlan: true,
  deliveryMethod: true,
  hasAbroadItems: true,
  address: true,
  affiliate: { select: { name: true, code: true } },
  user: { select: { name: true, email: true, phone: true } },
  pickupPoint: { select: { name: true, locationName: true } },
  shipment: {
    select: {
      trackingNumber: true,
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
      purchaseOrderId: true,
      product: {
        select: { name: true, emoji: true, vendor: { select: { businessName: true } } },
      },
    },
  },
} as const;

type ListOrder = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  paymentPlan: string;
  deliveryMethod: string;
  hasAbroadItems: boolean;
  address: string | null;
  affiliate: { name: string; code: string | null } | null;
  user: { name: string | null; email: string; phone: string | null };
  pickupPoint: { name: string; locationName: string } | null;
  shipment: {
    trackingNumber: string;
    processingAt: Date | null;
    forwarderReceivedAt: Date | null;
    transitAt: Date | null;
    arrivedGhanaAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  items: {
    quantity: number;
    purchaseOrderId: string | null;
    product: { name: string; emoji: string; vendor: { businessName: string } | null };
  }[];
};

function toRow(o: ListOrder): OrderRow {
  const placed = o.items.some((i) => i.purchaseOrderId);
  const route = o.hasAbroadItems ? "abroad" : "domestic";
  const first = o.items[0];
  const extra = o.items.length - 1;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    buyerName: o.user.name?.trim() || o.user.email,
    buyerEmail: o.user.email,
    buyerPhone: o.user.phone ?? "",
    itemSummary: first
      ? `${first.product.emoji ? `${first.product.emoji} ` : ""}${first.product.name} ×${first.quantity}${
          extra > 0 ? ` + ${extra} more` : ""
        }`
      : "—",
    itemCount: o.items.length,
    units: o.items.reduce((s, i) => s + i.quantity, 0),
    total: o.total,
    amountPaid: o.amountPaid,
    balanceDue: o.balanceDue,
    paymentPlan: o.paymentPlan,
    deliveryMethod: o.deliveryMethod === "pickup" ? "pickup" : "delivery",
    route,
    stage: deriveStage({ status: o.status, shipment: o.shipment, placed }),
    status: o.status,
    trackingNumber: o.shipment?.trackingNumber ?? "",
    affiliateName: o.affiliate?.name ?? "",
    shopNames: [...new Set(o.items.map((i) => i.product.vendor?.businessName).filter(Boolean))] as string[],
    destination:
      o.deliveryMethod === "pickup"
        ? o.pickupPoint
          ? `${o.pickupPoint.name}${o.pickupPoint.locationName ? `, ${o.pickupPoint.locationName}` : ""}`
          : "Pickup point"
        : (o.address?.trim() || "Customer address"),
  };
}

/** The coarse status filter a derived stage implies, so the database does what it can. */
function statusesFor(stage: string): string[] | null {
  if (stage === "cancelled") return ["cancelled"];
  if (stage === "awaiting_payment") return ["pending"];
  if (stage === "all") return null;
  return ["paid", "shipped", "delivered"];
}

export interface OrdersQuery {
  stage?: string;
  payment?: string;
  method?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export interface OrdersPage {
  orders: OrderRow[];
  total: number;
  /** How the whole book splits by stage, so the filter can carry counts. */
  counts: Record<string, number>;
}

export async function getFulfilmentOrders(q: OrdersQuery = {}): Promise<OrdersPage> {
  const stage = stageFilter(q.stage);
  const payment = paymentFilter(q.payment);
  const method = methodFilter(q.method);
  const term = (q.query ?? "").trim();
  const perPage = q.perPage ?? PER_PAGE_DEFAULT;
  const page = Math.max(1, q.page ?? 1);

  const statuses = statusesFor(stage);
  const rows = (await prisma.order.findMany({
    where: {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(method === "all" ? {} : { deliveryMethod: method }),
      ...(term
        ? {
            OR: [
              { orderNumber: { contains: term, mode: "insensitive" as const } },
              { address: { contains: term, mode: "insensitive" as const } },
              { user: { name: { contains: term, mode: "insensitive" as const } } },
              { user: { email: { contains: term, mode: "insensitive" as const } } },
              { user: { phone: { contains: term, mode: "insensitive" as const } } },
              { shipment: { trackingNumber: { contains: term, mode: "insensitive" as const } } },
              { items: { some: { product: { name: { contains: term, mode: "insensitive" as const } } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: LIST_SELECT,
  })) as ListOrder[];

  let all = rows.map(toRow);

  // The stage counts describe the same search, so the dropdown says how many
  // rows each option would actually show rather than how many exist overall.
  const counts: Record<string, number> = { all: all.length };
  for (const row of all) counts[row.stage] = (counts[row.stage] ?? 0) + 1;

  if (stage !== "all") all = all.filter((o) => o.stage === stage);
  if (payment === "paid") all = all.filter((o) => o.balanceDue <= 0 && o.amountPaid > 0);
  if (payment === "part") all = all.filter((o) => o.balanceDue > 0 && o.amountPaid > 0);
  if (payment === "unpaid") all = all.filter((o) => o.amountPaid <= 0);

  const total = all.length;
  const start = (page - 1) * perPage;
  return { orders: all.slice(start, start + perPage), total, counts };
}

/**
 * The head-of-table figures: what is waiting on somebody right now.
 *
 * Its own read, and a narrow one — the strip is unfiltered on purpose (an
 * order paid for in February is still somebody waiting today), so it cannot
 * be counted off the page the table is showing. Four columns and the shipment
 * stamps, rather than the whole row the table needs.
 */
export async function getFulfilmentSummary(): Promise<{
  total: number;
  awaitingPayment: number;
  toPlace: number;
  inTransit: number;
  ready: number;
  outstanding: number;
}> {
  const rows = await prisma.order.findMany({
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
  });

  const summary = {
    total: rows.length,
    awaitingPayment: 0,
    toPlace: 0,
    inTransit: 0,
    ready: 0,
    outstanding: 0,
  };

  for (const o of rows) {
    const stage = deriveStage({
      status: o.status,
      shipment: o.shipment,
      placed: o.items.some((i) => i.purchaseOrderId),
    });
    if (stage === "awaiting_payment") summary.awaitingPayment += 1;
    else if (stage === "placing") summary.toPlace += 1;
    else if (stage === "ordered" || stage === "at_forwarder" || stage === "in_transit" || stage === "arrived_ghana")
      summary.inTransit += 1;
    else if (stage === "ready") summary.ready += 1;
    if (stage !== "cancelled" && stage !== "awaiting_payment") {
      summary.outstanding += Math.max(0, o.balanceDue);
    }
  }

  summary.outstanding = Math.round(summary.outstanding * 100) / 100;
  return summary;
}

/**
 * Everything there is about one order.
 *
 * Deliberately one wide read rather than a dozen narrow ones: the detail
 * window is the screen an admin opens when a customer is on the phone, and it
 * is not useful if the seller's name arrives a second after the buyer's.
 */
export async function getOrderDossier(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          createdAt: true,
          role: true,
          _count: { select: { orders: true } },
        },
      },
      pickupPoint: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          locationName: true,
          openingHours: true,
          operator: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
      affiliate: {
        select: {
          id: true,
          name: true,
          code: true,
          phone: true,
          email: true,
          user: { select: { id: true, email: true } },
        },
      },
      shipment: {
        include: {
          freightAgent: { select: { id: true, name: true, email: true, phone: true } },
          arrivalPoint: { select: { id: true, name: true, city: true, address: true } },
        },
      },
      affiliateCommissions: {
        select: {
          id: true,
          amount: true,
          rate: true,
          status: true,
          fundedBy: true,
          holdUntil: true,
          createdAt: true,
        },
      },
      affiliateThreads: {
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          kind: true,
          topic: true,
          subject: true,
          status: true,
          priority: true,
          lastMessageAt: true,
          lastMessageText: true,
          lastMessageRole: true,
          createdAt: true,
          affiliate: { select: { id: true, name: true } },
        },
      },
      items: {
        include: {
          freightRoute: {
            select: {
              id: true,
              name: true,
              mode: true,
              minDays: true,
              maxDays: true,
              forwarder: {
                select: {
                  id: true,
                  name: true,
                  contactName: true,
                  contactPhone: true,
                  contactEmail: true,
                  ghanaAddress: true,
                  collectionCity: true,
                  originCountry: true,
                },
              },
              destinationPoint: { select: { id: true, name: true, city: true } },
            },
          },
          arrivalPoint: { select: { id: true, name: true, city: true } },
          consolidationPoint: { select: { id: true, name: true, city: true } },
          purchaseOrder: {
            select: {
              id: true,
              reference: true,
              status: true,
              supplierName: true,
              supplierUrl: true,
              supplierContact: true,
              note: true,
              placedAt: true,
              totalCost: true,
              placedBy: { select: { name: true, email: true } },
            },
          },
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              emoji: true,
              productType: true,
              supplierName: true,
              supplierContact: true,
              sourceUrl: true,
              preorderInfo: true,
              supplierDelivers: true,
              vendor: {
                select: {
                  id: true,
                  businessName: true,
                  slug: true,
                  whatsapp: true,
                  originCountry: true,
                  owner: { select: { id: true, name: true, email: true, phone: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type OrderDossier = NonNullable<Awaited<ReturnType<typeof getOrderDossier>>>;
