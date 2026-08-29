import "server-only";
import { prisma } from "@/lib/prisma";
import { lineCommission, money, platformAffiliateCost, sellerAffiliateCost } from "@/lib/commission";
import { getSellerEarnings, type SellerEarnings } from "@/lib/seller";

export const FINANCE_METRICS = [
  "gmv", "commission", "owed", "paid", "escrow", "delivery", "affiliate", "affiliateCost", "earnings",
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
    case "commission": {
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
        description: "Gross platform commission collected per order, before any affiliate commission Nickimart funds.",
        total: money(rows.reduce((s, r) => s + r.amount, 0)),
        columns: ["Order", "Customer", "Commission"],
        rows,
      };
    }
    case "earnings": {
      const orders = await prisma.order.findMany({
        where: { status: NOT_CANCELLED_PENDING },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          items: { select: { unitPrice: true, quantity: true, commissionRate: true, affiliateCommission: true, affiliateFundedBy: true } },
        },
      });
      const rows = orders
        .map((o) => ({
          id: o.id,
          primary: o.orderNumber,
          secondary: o.user.name ?? o.user.email,
          amount: money(o.items.reduce((s, i) => s + lineCommission(i) - platformAffiliateCost(i), 0)),
          href: `/admin/orders/${o.id}`,
        }))
        .filter((r) => r.amount !== 0);
      return {
        title: "Platform earnings",
        description: "Commission kept per order, after the affiliate commission Nickimart funds on products it enrolled itself.",
        total: money(rows.reduce((s, r) => s + r.amount, 0)),
        columns: ["Order", "Customer", "Net earnings"],
        rows,
      };
    }
    case "affiliateCost": {
      const items = await prisma.orderItem.findMany({
        where: { order: { status: NOT_CANCELLED_PENDING }, affiliateCommission: { gt: 0 } },
        orderBy: { order: { createdAt: "desc" } },
        select: {
          id: true,
          unitPrice: true,
          quantity: true,
          commissionRate: true,
          affiliateCommission: true,
          affiliateCommissionRate: true,
          affiliateFundedBy: true,
          product: { select: { name: true } },
          order: { select: { id: true, orderNumber: true, affiliate: { select: { name: true } } } },
        },
      });
      const rows = items.map((i) => ({
        id: i.id,
        primary: `${i.product.name} · ${i.order.orderNumber}`,
        secondary: `${i.affiliateCommissionRate}% · funded by ${i.affiliateFundedBy === "platform" ? "Nickimart" : "the seller"} · ${i.order.affiliate?.name ?? "—"}`,
        amount: money(i.affiliateCommission),
        href: `/admin/orders/${i.order.id}`,
      }));
      return {
        title: "Affiliate commission accrued",
        description: "Commission earned by affiliates per line item, and who is paying for it.",
        total: money(rows.reduce((s, r) => s + r.amount, 0)),
        columns: ["Item / order", "Rate & funder", "Commission"],
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
        include: {
          user: { select: { name: true, email: true } },
          items: { select: { unitPrice: true, quantity: true, commissionRate: true, affiliateCommission: true, affiliateFundedBy: true } },
        },
      });
      const held = (o: (typeof orders)[number]) =>
        money(o.items.reduce((a, i) => a + i.unitPrice * i.quantity - lineCommission(i) - sellerAffiliateCost(i), 0));
      return {
        title: "In escrow",
        description: "Seller earnings held on paid-but-undelivered orders.",
        total: money(orders.reduce((s, o) => s + held(o), 0)),
        columns: ["Order", "Customer", "Held"],
        rows: orders.map((o) => ({ id: o.id, primary: o.orderNumber, secondary: o.user.name ?? o.user.email, amount: held(o), href: `/admin/orders/${o.id}` })),
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
  /** Affiliate commission accrued on all referred sales, whoever funds it. */
  affiliateAccrued: number;
  /** The slice of that which Nickimart funds (products the admin enrolled). */
  affiliateFundedByPlatform: number;
  /** The slice sellers fund (products they enrolled themselves). */
  affiliateFundedBySellers: number;
  /**
   * Platform earnings = commission − affiliate commission Nickimart funds.
   * Delivery is pass-through to freight, so it isn't counted as earnings.
   */
  platformEarnings: number;
}

/** Platform-wide financial snapshot for the Finance overview. */
export async function getFinanceOverview(): Promise<FinanceOverview> {
  const notCancelledPending = { notIn: ["cancelled", "pending"] };
  const [orders, items, payouts, affPayouts, vendors] = await Promise.all([
    prisma.order.findMany({ where: { status: notCancelledPending }, select: { total: true, deliveryFee: true } }),
    prisma.orderItem.findMany({
      where: { order: { status: notCancelledPending } },
      select: {
        unitPrice: true,
        quantity: true,
        commissionRate: true,
        affiliateCommission: true,
        affiliateFundedBy: true,
      },
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
  const affiliateFundedByPlatform = items.reduce((s, i) => s + platformAffiliateCost(i), 0);
  const affiliateFundedBySellers = items.reduce((s, i) => s + sellerAffiliateCost(i), 0);

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
    affiliateAccrued: money(affiliateFundedByPlatform + affiliateFundedBySellers),
    affiliateFundedByPlatform: money(affiliateFundedByPlatform),
    affiliateFundedBySellers: money(affiliateFundedBySellers),
    platformEarnings: money(commission - affiliateFundedByPlatform),
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
