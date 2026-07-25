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
