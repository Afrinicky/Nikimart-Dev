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

/**
 * The programme over a window, for the admin's roster screen.
 *
 * The tiles above that roster were all-time: total referred sales since the
 * programme opened, commission earned ever. Both only go up, so neither could
 * answer the question an admin actually brings to the screen — is this costing
 * us more than it is bringing in, this month.
 *
 * Three of the figures deliberately do not answer to the window, and the
 * screen says so. How many affiliates are on the books is a standing count;
 * what is owed is a standing balance; and what is waiting on a payout decision
 * is somebody waiting today, whenever they asked. Hiding any of those because
 * the picker says seven days would be the one place here where the filter does
 * harm.
 */
export interface AffiliateWindowOverview {
  /** On the books now. */
  total: number;
  active: number;
  /** Joined inside the window. */
  joined: number;
  /** Clicks on their links inside the window. */
  clicks: number;
  /** Orders attributed inside the window, and what they were worth. */
  referredOrders: number;
  referredSales: number;
  /** Commission accrued inside the window, net of what was taken back. */
  commissionEarned: number;
  /** Payouts that actually left inside the window. */
  paidOut: number;
  /** Standing: commission cleared and not yet settled or requested. */
  owed: number;
  /** Standing: requests waiting on a decision. */
  pendingPayouts: number;
  pendingPayoutCount: number;
  previous: { referredOrders: number; referredSales: number; commissionEarned: number } | null;
}

export async function getAffiliateWindowOverview(w: {
  start: Date | null;
  end: Date;
  days: number | null;
}): Promise<AffiliateWindowOverview> {
  const within = { createdAt: { ...(w.start ? { gte: w.start } : {}), lt: w.end } };
  // The window immediately before this one. All time has no "before", and
  // inventing one would compare a real figure against a stretch of time the
  // programme did not exist for.
  const previousRange =
    w.start && w.days !== null
      ? {
          gte: new Date(w.start.getTime() - w.days * 86_400_000),
          lt: w.start,
        }
      : null;

  const soldWhere = (range: { gte?: Date; lt: Date }) => ({
    affiliateId: { not: null },
    status: { notIn: ["cancelled", "pending"] },
    createdAt: range,
  });

  const [affiliates, joined, clicks, sold, ledger, payouts, earlierSold, earlierLedger] =
    await Promise.all([
      prisma.affiliate.findMany({ select: { status: true } }),
      prisma.affiliate.count({ where: within }),
      prisma.affiliateClick.count({ where: within }).catch(() => 0),
      prisma.order.aggregate({
        where: soldWhere(within.createdAt),
        _count: { _all: true },
        _sum: { subtotal: true, affiliateCommission: true },
      }),
      prisma.affiliateCommission
        .findMany({ where: within, select: { amount: true, reversedAmount: true } })
        .catch(() => [] as { amount: number; reversedAmount: number }[]),
      prisma.affiliatePayout.findMany({
        select: { amount: true, status: true, paidAt: true },
      }),
      previousRange
        ? prisma.order.aggregate({
            where: soldWhere(previousRange),
            _count: { _all: true },
            _sum: { subtotal: true, affiliateCommission: true },
          })
        : Promise.resolve(null),
      previousRange
        ? prisma.affiliateCommission
            .findMany({
              where: { createdAt: previousRange },
              select: { amount: true, reversedAmount: true },
            })
            .catch(() => [] as { amount: number; reversedAmount: number }[])
        : Promise.resolve(null),
    ]);

  // Commission comes off the ledger, which nets out reversals and refunds, and
  // falls back to the order-level snapshots for referrals that predate it.
  // Without the fallback every historical referral reads as zero.
  const netLedger = (rows: { amount: number; reversedAmount: number }[]) =>
    rows.reduce((s, c) => s + Math.max(0, c.amount - c.reversedAmount), 0);
  const commissionEarned =
    ledger.length > 0 ? netLedger(ledger) : (sold._sum.affiliateCommission ?? 0);

  // A payout belongs to the window the money actually left in, so it is dated
  // by `paidAt`. One with no date is older than the column and is left out of
  // every window but all time, where there is no start to exclude it.
  const paidOut = payouts
    .filter(
      (p) =>
        p.status === "paid" &&
        (p.paidAt
          ? (!w.start || p.paidAt >= w.start) && p.paidAt < w.end
          : w.start === null),
    )
    .reduce((s, p) => s + p.amount, 0);

  const waiting = payouts.filter((p) => p.status === "pending" || p.status === "processing");
  const allPaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const allPending = waiting.reduce((s, p) => s + p.amount, 0);
  const allEarned = await prisma.affiliateCommission
    .findMany({ select: { amount: true, reversedAmount: true } })
    .then(netLedger)
    .catch(() => 0);

  return {
    total: affiliates.length,
    active: affiliates.filter((a) => a.status === "active").length,
    joined,
    clicks,
    referredOrders: sold._count._all,
    referredSales: money(sold._sum.subtotal ?? 0),
    commissionEarned: money(commissionEarned),
    paidOut: money(paidOut),
    owed: money(Math.max(0, allEarned - allPaid - allPending)),
    pendingPayouts: money(allPending),
    pendingPayoutCount: waiting.length,
    previous:
      earlierSold && earlierLedger
        ? {
            referredOrders: earlierSold._count._all,
            referredSales: money(earlierSold._sum.subtotal ?? 0),
            commissionEarned: money(
              earlierLedger.length > 0
                ? netLedger(earlierLedger)
                : (earlierSold._sum.affiliateCommission ?? 0),
            ),
          }
        : null,
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
