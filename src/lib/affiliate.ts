import "server-only";
import { prisma } from "@/lib/prisma";
import { money, resolveCommissionRate } from "@/lib/commission";
import { getAffiliateRate, getCommissionRate } from "@/lib/settings";
import { resolveAffiliateRate } from "@/lib/affiliate-commission";

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

/** One product an affiliate can promote, with what they'd earn on a sale. */
export interface PromotableProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  emoji: string;
  categoryName: string;
  vendorName: string;
  /** Effective commission percent of the item price. */
  rate: number;
  /** Cash earned on a single unit at the current price. */
  earnPerSale: number;
  /** "seller" (the shop funds it) or "platform" (NikiMart funds it). */
  fundedBy: string;
}

/**
 * Every product currently enrolled in the affiliate programme, with the
 * commission an affiliate earns on each. Enrolment is per product — a seller
 * opts in at their own expense, or an admin opts in at NikiMart's — so this is
 * the definitive list of what an affiliate can share.
 */
export async function getPromotableProducts(): Promise<PromotableProduct[]> {
  const [products, defaultCommission, defaultAffiliateRate] = await Promise.all([
    prisma.product.findMany({
      where: { affiliateEnabled: true, isArchived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        image: true,
        emoji: true,
        affiliateEnabled: true,
        affiliateEnrolledBy: true,
        affiliateCommissionRate: true,
        category: { select: { name: true, commissionRate: true, affiliateCommissionRate: true } },
        vendor: { select: { businessName: true } },
        images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
      },
    }),
    getCommissionRate(),
    getAffiliateRate(),
  ]);

  return products
    .map((p) => {
      const platformCommissionRate = resolveCommissionRate(p.category?.commissionRate, defaultCommission);
      const resolved = resolveAffiliateRate({
        affiliateEnabled: p.affiliateEnabled,
        affiliateEnrolledBy: p.affiliateEnrolledBy,
        affiliateCommissionRate: p.affiliateCommissionRate,
        categoryAffiliateRate: p.category?.affiliateCommissionRate,
        defaultAffiliateRate,
        platformCommissionRate,
      });
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        image: p.images[0]?.url ?? p.image ?? null,
        emoji: p.emoji,
        categoryName: p.category?.name ?? "—",
        vendorName: p.vendor?.businessName ?? "—",
        rate: resolved.rate,
        earnPerSale: money((p.price * resolved.rate) / 100),
        fundedBy: resolved.fundedBy,
      };
    })
    .filter((p) => p.rate > 0)
    .sort((a, b) => b.earnPerSale - a.earnPerSale);
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

/** Program-wide affiliate KPIs. */
export async function getAffiliateOverview(): Promise<AffiliateOverview> {
  const [affiliates, orders, payouts] = await Promise.all([
    prisma.affiliate.findMany({ select: { status: true } }),
    prisma.order.findMany({ where: { affiliateId: { not: null }, status: { notIn: ["cancelled", "pending"] } }, select: { subtotal: true, affiliateCommission: true } }),
    prisma.affiliatePayout.findMany({ select: { amount: true, status: true } }),
  ]);
  const commissionEarned = orders.reduce((s, o) => s + o.affiliateCommission, 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
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
 * Compute an affiliate's referral earnings + payout position. Commission only
 * becomes payable once the referred order is delivered — mirroring how seller
 * earnings clear — so a payout is never made against an order that can still
 * be cancelled.
 */
export async function getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarnings> {
  const [orders, payouts] = await Promise.all([
    prisma.order.findMany({
      where: { affiliateId, status: { notIn: ["cancelled", "pending"] } },
      select: { affiliateCommission: true, status: true },
    }),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, select: { amount: true, status: true } }),
  ]);

  let earned = 0;
  let cleared = 0;
  let inEscrow = 0;
  for (const o of orders) {
    earned += o.affiliateCommission;
    if (o.status === "delivered") cleared += o.affiliateCommission;
    else inEscrow += o.affiliateCommission;
  }

  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingPayouts = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
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
