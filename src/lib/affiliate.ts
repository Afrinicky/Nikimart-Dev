import "server-only";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/commission";

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
  /** Total commission earned on those orders. */
  earned: number;
  paidOut: number;
  pendingPayouts: number;
  /** earned − paidOut − pendingPayouts. */
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

/** Compute an affiliate's referral earnings + payout position. */
export async function getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarnings> {
  const [orders, payouts] = await Promise.all([
    prisma.order.findMany({
      where: { affiliateId, status: { notIn: ["cancelled", "pending"] } },
      select: { affiliateCommission: true },
    }),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, select: { amount: true, status: true } }),
  ]);
  const earned = orders.reduce((s, o) => s + o.affiliateCommission, 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingPayouts = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  return {
    referredOrders: orders.length,
    earned: money(earned),
    paidOut: money(paidOut),
    pendingPayouts: money(pendingPayouts),
    available: money(Math.max(0, earned - paidOut - pendingPayouts)),
  };
}
