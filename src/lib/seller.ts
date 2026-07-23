import "server-only";
import { prisma } from "@/lib/prisma";
import { lineCommission, money } from "@/lib/commission";

/** The signed-in seller's vendor (shop), or null if they haven't registered one. */
export async function getSellerVendor(userId: string) {
  return prisma.vendor.findFirst({ where: { ownerId: userId } });
}

export interface SellerEarnings {
  /** Gross sales value (before commission), excluding cancelled orders. */
  gross: number;
  /** Total platform commission across those sales. */
  commission: number;
  /** Net earned lifetime (gross − commission), excluding cancelled. */
  net: number;
  /** Net for orders not yet delivered (paid/shipped) — held until fulfilled. */
  inEscrow: number;
  /** Net for delivered orders — cleared and eligible for payout. */
  cleared: number;
  /** Sum of completed payouts. */
  paidOut: number;
  /** Sum of payouts still pending. */
  pendingPayouts: number;
  /** Cleared − paidOut − pendingPayouts. What the seller can still be paid. */
  available: number;
}

/**
 * Compute a vendor's settlement position from their sold line items and payout
 * history. Uses the commission rate snapshotted on each order item.
 */
export async function getSellerEarnings(vendorId: string): Promise<SellerEarnings> {
  const [items, payouts] = await Promise.all([
    prisma.orderItem.findMany({
      where: { product: { vendorId } },
      select: { unitPrice: true, quantity: true, commissionRate: true, order: { select: { status: true } } },
    }),
    prisma.payout.findMany({ where: { vendorId }, select: { amount: true, status: true } }),
  ]);

  let gross = 0;
  let commission = 0;
  let inEscrow = 0;
  let cleared = 0;

  for (const it of items) {
    const status = it.order.status;
    if (status === "cancelled" || status === "pending") continue; // unpaid/cancelled don't count
    const lineGross = it.unitPrice * it.quantity;
    const lineComm = lineCommission(it);
    const lineNet = lineGross - lineComm;
    gross += lineGross;
    commission += lineComm;
    if (status === "delivered") cleared += lineNet;
    else inEscrow += lineNet; // paid | shipped
  }

  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingPayouts = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const net = gross - commission;
  const available = Math.max(0, cleared - paidOut - pendingPayouts);

  return {
    gross: money(gross),
    commission: money(commission),
    net: money(net),
    inEscrow: money(inEscrow),
    cleared: money(cleared),
    paidOut: money(paidOut),
    pendingPayouts: money(pendingPayouts),
    available: money(available),
  };
}
