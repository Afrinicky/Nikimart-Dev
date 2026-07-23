import "server-only";
import { prisma } from "@/lib/prisma";
import { lineCommission, money } from "@/lib/commission";
import { getSellerEarnings, type SellerEarnings } from "@/lib/seller";

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
