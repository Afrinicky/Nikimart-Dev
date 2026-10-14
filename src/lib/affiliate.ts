import "server-only";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/commission";
import { getLedgerBalance } from "@/lib/affiliate-ledger";

export const REFERRAL_COOKIE = "nikimart_ref";

/** The affiliate account linked to a user, or null. */
export async function getAffiliateForUser(userId: string) {
  return prisma.affiliate.findUnique({ where: { userId } });
}

/** Generate an unused, human-friendly referral code. */
export async function generateAffiliateCode(seed = ""): Promise<string> {
  const base = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  for (let i = 0; i < 20; i++) {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${base || "NIKI"}${rand}`.slice(0, 12);
    const clash = await prisma.affiliate.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `NIKI${Date.now().toString(36).toUpperCase()}`;
}

export interface AffiliateEarnings {
  /** Number of paid orders attributed to this affiliate. */
  referredOrders: number;
  /** Total commission earned on those orders (delivered + still in escrow). */
  earned: number;
  /**
   * Commission on orders that are paid but not yet delivered. Held until the
   * buyer actually receives the goods, so a cancelled or returned order never
   * leaves the platform having paid commission on a sale that didn't complete.
   */
  inEscrow: number;
  /** Commission on delivered orders — cleared and eligible for payout. */
  cleared: number;
  paidOut: number;
  pendingPayouts: number;
  /** cleared − paidOut − pendingPayouts. */
  available: number;
}

export interface AffiliateOverview {
  total: number;
  active: number;
  referredSales: number;
  commissionEarned: number;
  paidOut: number;
  owed: number;
}

/**
 * Program-wide affiliate KPIs.
 *
 * Commission comes off the ledger, which nets out reversals and refunds, and
 * falls back to the order-level snapshots for a platform whose referrals all
 * predate the ledger. Referred sales stay on the orders: that is the GMV the
 * programme produced, and it does not shrink because a commission was clawed
 * back on one line of one order.
 */
export async function getAffiliateOverview(): Promise<AffiliateOverview> {
  const [affiliates, orders, payouts, commissions] = await Promise.all([
    prisma.affiliate.findMany({ select: { status: true } }),
    prisma.order.findMany({ where: { affiliateId: { not: null }, status: { notIn: ["cancelled", "pending"] } }, select: { subtotal: true, affiliateCommission: true } }),
    prisma.affiliatePayout.findMany({ select: { amount: true, status: true } }),
    prisma.affiliateCommission
      .findMany({ select: { amount: true, reversedAmount: true } })
      .catch(() => [] as { amount: number; reversedAmount: number }[]),
  ]);
  const commissionEarned =
    commissions.length > 0
      ? commissions.reduce((s, c) => s + Math.max(0, c.amount - c.reversedAmount), 0)
      : orders.reduce((s, o) => s + o.affiliateCommission, 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pending = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((s, p) => s + p.amount, 0);
  return {
    total: affiliates.length,
    active: affiliates.filter((a) => a.status === "active").length,
    referredSales: money(orders.reduce((s, o) => s + o.subtotal, 0)),
    commissionEarned: money(commissionEarned),
    paidOut: money(paidOut),
    owed: money(Math.max(0, commissionEarned - paidOut - pending)),
  };
}

export interface AffiliateRow {
  id: string;
  name: string;
  code: string | null;
  status: string;
  isUser: boolean;
  earnings: AffiliateEarnings;
}

/** All affiliates with their referral stats, best earners first. */
export async function getAllAffiliatesWithStats(): Promise<AffiliateRow[]> {
  const affiliates = await prisma.affiliate.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, code: true, status: true, userId: true } });
  const rows = await Promise.all(
    affiliates.map(async (a) => ({ id: a.id, name: a.name, code: a.code, status: a.status, isUser: Boolean(a.userId), earnings: await getAffiliateEarnings(a.id) })),
  );
  return rows.sort((x, y) => y.earnings.earned - x.earnings.earned);
}

/**
 * Compute an affiliate's referral earnings + payout position.
 *
 * Read off the commission ledger (lib/affiliate-ledger), which is the one
 * thing that knows about reversals, partial refunds, the return window after
 * delivery, and which payout settled which line. Commission only becomes
 * payable once the referred order has been delivered *and* its return window
 * has run out, so a payout is never made against a sale that can still come
 * back.
 *
 * Orders placed before the ledger existed have no rows in it, so an affiliate
 * with none falls back to the order-level snapshots. Without that, every
 * historical referral would read as zero the day this shipped.
 */
export async function getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarnings> {
  const [ledger, payouts] = await Promise.all([
    getLedgerBalance(affiliateId),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, select: { amount: true, status: true } }),
  ]);

  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingPayouts = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((s, p) => s + p.amount, 0);

  if (ledger.lines > 0) {
    return {
      referredOrders: ledger.orders,
      earned: ledger.earned,
      // Everything the affiliate cannot touch yet: the order has not been
      // delivered, or it has and the buyer can still send it back.
      inEscrow: money(ledger.pending + ledger.clearing),
      cleared: money(ledger.cleared + ledger.paid),
      paidOut: money(paidOut),
      pendingPayouts: money(pendingPayouts),
      available: money(Math.max(0, ledger.cleared - pendingPayouts)),
    };
  }

  // --- Pre-ledger orders ----------------------------------------------------
  const orders = await prisma.order.findMany({
    where: { affiliateId, status: { notIn: ["cancelled", "pending"] } },
    select: { affiliateCommission: true, status: true },
  });

  let earned = 0;
  let cleared = 0;
  let inEscrow = 0;
  for (const o of orders) {
    earned += o.affiliateCommission;
    if (o.status === "delivered") cleared += o.affiliateCommission;
    else inEscrow += o.affiliateCommission;
  }

  return {
    referredOrders: orders.length,
    earned: money(earned),
    inEscrow: money(inEscrow),
    cleared: money(cleared),
    paidOut: money(paidOut),
    pendingPayouts: money(pendingPayouts),
    available: money(Math.max(0, cleared - paidOut - pendingPayouts)),
  };
}
