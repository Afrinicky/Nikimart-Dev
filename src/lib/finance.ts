import "server-only";
import { prisma } from "@/lib/prisma";
import { lineCommission, money } from "@/lib/commission";
import { getSellerEarnings, type SellerEarnings } from "@/lib/seller";

export const FINANCE_METRICS = [
  "gmv", "commission", "owed", "paid", "escrow", "delivery", "affiliate", "earnings",
] as const;
export type FinanceMetric = (typeof FINANCE_METRICS)[number];

export interface BreakdownRow {
  id: string;
  primary: string;
  secondary: string;
  amount: number;
  href?: string;
}
export interface Breakdown {
  title: string;
  description: string;
  total: number;
  columns: [string, string, string];
  rows: BreakdownRow[];
}

const NOT_CANCELLED_PENDING = { notIn: ["cancelled", "pending"] };
const shortDate = (d: Date) => d.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });

/** Detailed breakdown behind a finance KPI. */
export async function getFinanceBreakdown(metric: FinanceMetric): Promise<Breakdown> {
  switch (metric) {
    case "gmv": {
      const orders = await prisma.order.findMany({
        where: { status: NOT_CANCELLED_PENDING },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      });
      return {
        title: "Gross merchandise value",
        description: "Every paid order counted in GMV (item value + delivery).",
        total: money(orders.reduce((s, o) => s + o.total, 0)),
        columns: ["Order", "Customer", "Total"],
        rows: orders.map((o) => ({ id: o.id, primary: o.orderNumber, secondary: o.user.name ?? o.user.email, amount: o.total, href: `/admin/orders/${o.id}` })),
      };
    }
    case "commission":
    case "earnings": {
      const orders = await prisma.order.findMany({
        where: { status: NOT_CANCELLED_PENDING },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } }, items: { select: { unitPrice: true, quantity: true, commissionRate: true } } },
      });
      const rows = orders
        .map((o) => ({ id: o.id, primary: o.orderNumber, secondary: o.user.name ?? o.user.email, amount: money(o.items.reduce((s, i) => s + lineCommission(i), 0)), href: `/admin/orders/${o.id}` }))
        .filter((r) => r.amount > 0);
      return {
        title: "Commission earned",
        description: "Platform commission collected per order (also the platform's earnings).",
        total: money(rows.reduce((s, r) => s + r.amount, 0)),
        columns: ["Order", "Customer", "Commission"],
        rows,
      };
    }
    case "owed": {
      const rows = (await getVendorSettlements())
        .filter((s) => s.earnings.available > 0)
        .map((s) => ({ id: s.id, primary: s.businessName, secondary: "Cleared, awaiting payout", amount: s.earnings.available, href: `/admin/finance/sellers/${s.id}` }));
      return {
        title: "Owed to sellers",
        description: "Cleared earnings still to be paid out, per seller.",
        total: money(rows.reduce((s, r) => s + r.amount, 0)),
        columns: ["Seller", "Status", "Available"],
        rows,
      };
    }
    case "paid": {
      const payouts = await prisma.payout.findMany({ where: { status: "paid" }, orderBy: { createdAt: "desc" }, include: { vendor: { select: { id: true, businessName: true } } } });
      return {
        title: "Paid to sellers",
        description: "Completed seller settlements.",
        total: money(payouts.reduce((s, p) => s + p.amount, 0)),
        columns: ["Seller", "Method / date", "Amount"],
        rows: payouts.map((p) => ({ id: p.id, primary: p.vendor.businessName, secondary: `${p.method || "—"} · ${shortDate(p.paidAt ?? p.createdAt)}`, amount: p.amount, href: `/admin/finance/sellers/${p.vendor.id}` })),
      };
    }
    case "escrow": {
      const orders = await prisma.order.findMany({
        where: { status: { in: ["paid", "shipped"] } },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } }, items: { select: { unitPrice: true, quantity: true, commissionRate: true } } },
      });
      return {
        title: "In escrow",
        description: "Seller earnings held on paid-but-undelivered orders.",
        total: money(orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.unitPrice * i.quantity - lineCommission(i), 0), 0)),
        columns: ["Order", "Customer", "Held"],
        rows: orders.map((o) => ({ id: o.id, primary: o.orderNumber, secondary: o.user.name ?? o.user.email, amount: money(o.items.reduce((a, i) => a + i.unitPrice * i.quantity - lineCommission(i), 0)), href: `/admin/orders/${o.id}` })),
      };
    }
    case "delivery": {
      const orders = await prisma.order.findMany({ where: { status: NOT_CANCELLED_PENDING, deliveryFee: { gt: 0 } }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
      return {
        title: "Delivery collected",
        description: "Delivery fees collected on paid orders.",
        total: money(orders.reduce((s, o) => s + o.deliveryFee, 0)),
        columns: ["Order", "Customer", "Delivery"],
        rows: orders.map((o) => ({ id: o.id, primary: o.orderNumber, secondary: o.user.name ?? o.user.email, amount: o.deliveryFee, href: `/admin/orders/${o.id}` })),
      };
    }
    case "affiliate": {
      const payouts = await prisma.affiliatePayout.findMany({ where: { status: "paid" }, orderBy: { createdAt: "desc" }, include: { affiliate: { select: { id: true, name: true } } } });
      return {
        title: "Affiliate payments",
        description: "Commission payments made to affiliates.",
        total: money(payouts.reduce((s, p) => s + p.amount, 0)),
        columns: ["Affiliate", "Method / date", "Amount"],
        rows: payouts.map((p) => ({ id: p.id, primary: p.affiliate.name, secondary: `${p.method || "—"} · ${shortDate(p.paidAt ?? p.createdAt)}`, amount: p.amount, href: `/admin/finance/affiliates/${p.affiliate.id}` })),
      };
    }
  }
}

export interface FinanceOverview {
  /** Gross merchandise value — paid order totals (incl. delivery). */
  gmv: number;
  /** Platform commission earned across all sold items. */
  commission: number;
  /** Delivery fees collected. */
  delivery: number;
  /** Cleared earnings still owed to sellers (available for payout). */
  owedToSellers: number;
  /** Held in escrow (paid but not yet delivered). */
  inEscrow: number;
  /** Total already paid out to sellers. */
  sellerPaidOut: number;
  /** Seller payouts still pending. */
  sellerPending: number;
  /** Total paid to affiliates. */
  affiliatePaid: number;
  /** Platform earnings = commission (delivery is pass-through to freight). */
  platformEarnings: number;
}

/** Platform-wide financial snapshot for the Finance overview. */
export async function getFinanceOverview(): Promise<FinanceOverview> {
  const notCancelledPending = { notIn: ["cancelled", "pending"] };
  const [orders, items, payouts, affPayouts, vendors] = await Promise.all([
    prisma.order.findMany({ where: { status: notCancelledPending }, select: { total: true, deliveryFee: true } }),
    prisma.orderItem.findMany({
      where: { order: { status: notCancelledPending } },
      select: { unitPrice: true, quantity: true, commissionRate: true },
    }),
    prisma.payout.findMany({ select: { amount: true, status: true } }),
    prisma.affiliatePayout.findMany({ select: { amount: true, status: true } }),
    prisma.vendor.findMany({ select: { id: true } }),
  ]);

  const gmv = orders.reduce((s, o) => s + o.total, 0);
  const delivery = orders.reduce((s, o) => s + o.deliveryFee, 0);
  const commission = items.reduce((s, i) => s + lineCommission(i), 0);
  const sellerPaidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const sellerPending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const affiliatePaid = affPayouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  // Aggregate seller balances (available + escrow).
  let owedToSellers = 0;
  let inEscrow = 0;
  await Promise.all(
    vendors.map(async (v) => {
      const e = await getSellerEarnings(v.id);
      owedToSellers += e.available;
      inEscrow += e.inEscrow;
    }),
  );

  return {
    gmv: money(gmv),
    commission: money(commission),
    delivery: money(delivery),
    owedToSellers: money(owedToSellers),
    inEscrow: money(inEscrow),
    sellerPaidOut: money(sellerPaidOut),
    sellerPending: money(sellerPending),
    affiliatePaid: money(affiliatePaid),
    platformEarnings: money(commission),
  };
}

export interface VendorSettlementRow {
  id: string;
  businessName: string;
  earnings: SellerEarnings;
}

/** Per-vendor settlement rows for the payouts table (only vendors with sales). */
export async function getVendorSettlements(): Promise<VendorSettlementRow[]> {
  const vendors = await prisma.vendor.findMany({ select: { id: true, businessName: true }, orderBy: { businessName: "asc" } });
  const rows = await Promise.all(
    vendors.map(async (v) => ({ id: v.id, businessName: v.businessName, earnings: await getSellerEarnings(v.id) })),
  );
  return rows
    .filter((r) => r.earnings.gross > 0 || r.earnings.paidOut > 0 || r.earnings.pendingPayouts > 0)
    .sort((a, b) => b.earnings.available - a.earnings.available);
}
