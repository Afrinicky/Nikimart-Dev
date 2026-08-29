import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Admin figures for the data storefront. Every read is wrapped so the console
 * still renders — with zeros and an explanatory note — before the tables have
 * been migrated onto a database.
 */

export interface DataStats {
  /** True when the tables exist and the numbers below are real. */
  available: boolean;
  todayOrders: number;
  todayRevenue: number;
  pendingPayment: number;
  /** Paid but not yet delivered — the queue that needs watching. */
  inFlight: number;
  failed: number;
  completed: number;
  revenue: number;
  cost: number;
  profit: number;
  afaPending: number;
}

const EMPTY: DataStats = {
  available: false,
  todayOrders: 0,
  todayRevenue: 0,
  pendingPayment: 0,
  inFlight: 0,
  failed: 0,
  completed: 0,
  revenue: 0,
  cost: 0,
  profit: 0,
  afaPending: 0,
};

export async function getDataStats(): Promise<DataStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    // Only paid orders count as revenue — a "pending" row is an abandoned
    // checkout, not a sale.
    const paidWhere = { paymentStatus: "paid" as const };

    const [today, pendingPayment, inFlight, failed, completed, totals, afaPending] =
      await Promise.all([
        prisma.dataOrder.aggregate({
          where: { ...paidWhere, createdAt: { gte: startOfToday } },
          _count: { _all: true },
          _sum: { price: true },
        }),
        prisma.dataOrder.count({ where: { paymentStatus: "unpaid", status: "pending" } }),
        prisma.dataOrder.count({ where: { ...paidWhere, status: { in: ["paid", "processing"] } } }),
        prisma.dataOrder.count({ where: { status: "failed" } }),
        prisma.dataOrder.count({ where: { status: "completed" } }),
        prisma.dataOrder.aggregate({
          where: { ...paidWhere, status: { not: "refunded" } },
          _sum: { price: true, costPrice: true },
        }),
        prisma.afaRegistration.count({ where: { status: { in: ["paid", "processing"] } } }),
      ]);

    const revenue = totals._sum.price ?? 0;
    const cost = totals._sum.costPrice ?? 0;

    return {
      available: true,
      todayOrders: today._count._all,
      todayRevenue: today._sum.price ?? 0,
      pendingPayment,
      inFlight,
      failed,
      completed,
      revenue,
      cost,
      // Cost is only known for orders the provider priced back to us, so the
      // margin is a floor, not a guarantee.
      profit: Math.round((revenue - cost) * 100) / 100,
      afaPending,
    };
  } catch {
    return EMPTY;
  }
}

export interface AdminDataOrder {
  id: string;
  reference: string;
  network: string;
  sizeGb: number;
  price: number;
  costPrice: number;
  recipientPhone: string;
  buyerPhone: string;
  buyerName: string | null;
  status: string;
  paymentStatus: string;
  providerCode: string | null;
  providerStatus: string | null;
  providerMessage: string | null;
  providerOrderId: string | null;
  // Where the sale came from and, when it was an agent, who.
  source: string;
  agentName: string | null;
  agentCode: string | null;
  agentCommission: number;
  commissionStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A human label for an order's origin: "Nickimart" for the house storefront, or
 * the agent's store name (with their code) for an agent sale.
 */
export function orderSourceLabel(o: {
  source: string;
  agentName: string | null;
  agentCode: string | null;
}): string {
  if (o.source === "WEB" || !o.agentName) return "Nickimart";
  const where = o.source === "STOREFRONT" ? "Storefront" : "Dashboard";
  const who = o.agentCode ? `${o.agentName} (${o.agentCode})` : o.agentName;
  return `Agent · ${who} · ${where}`;
}

export interface OrderPage {
  orders: AdminDataOrder[];
  total: number;
  available: boolean;
}

export const ORDERS_PER_PAGE = 25;

export async function getDataOrders(opts: {
  status?: string;
  query?: string;
  page?: number;
}): Promise<OrderPage> {
  const page = Math.max(1, opts.page ?? 1);
  const query = (opts.query ?? "").trim();

  const where: Record<string, unknown> = {};
  if (opts.status && opts.status !== "all") where.status = opts.status;
  if (query) {
    const digits = query.replace(/\D/g, "");
    where.OR = [
      { reference: { contains: query.toUpperCase() } },
      ...(digits
        ? [{ recipientPhone: { contains: digits } }, { buyerPhone: { contains: digits } }]
        : []),
    ];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.dataOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * ORDERS_PER_PAGE,
        take: ORDERS_PER_PAGE,
        include: { agent: { select: { storeName: true, code: true } } },
      }),
      prisma.dataOrder.count({ where }),
    ]);
    const orders: AdminDataOrder[] = rows.map(({ agent, ...o }) => ({
      ...o,
      agentName: agent?.storeName ?? null,
      agentCode: agent?.code ?? null,
    }));
    return { orders, total, available: true };
  } catch {
    return { orders: [], total: 0, available: false };
  }
}

export async function getAfaRegistrations() {
  try {
    return await prisma.afaRegistration.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  } catch {
    return [];
  }
}
