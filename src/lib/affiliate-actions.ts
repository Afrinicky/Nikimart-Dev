"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { generateAffiliateCode, getAffiliateEarnings } from "@/lib/affiliate";

export type AffiliateState = { ok?: boolean; error?: string };

/** Turn the signed-in user into an affiliate (idempotent). */
export async function becomeAffiliate(_prev: AffiliateState, fd: FormData): Promise<AffiliateState> {
  const user = await requireUser();
  const existing = await prisma.affiliate.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (existing) return { ok: true };

  const preferred = String(fd.get("code") ?? "").trim();
  let code: string;
  if (preferred) {
    const clean = preferred.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
    const clash = clean ? await prisma.affiliate.findUnique({ where: { code: clean }, select: { id: true } }) : true;
    code = clash ? await generateAffiliateCode(user.name ?? "") : clean;
  } else {
    code = await generateAffiliateCode(user.name ?? "");
  }

  try {
    await prisma.affiliate.create({
      data: { userId: user.id, name: user.name ?? "Affiliate", email: user.email ?? "", phone: "", code },
    });
  } catch {
    return { error: "Couldn't set up your affiliate account. Please try again." };
  }
  revalidatePath("/affiliate");
  return { ok: true };
}

/** Affiliate requests a payout of up to their available balance. */
export async function requestAffiliatePayout(_prev: AffiliateState, fd: FormData): Promise<AffiliateState> {
  const user = await requireUser();
  const affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id } });
  if (!affiliate) return { error: "You're not an affiliate yet." };

  const value = Number(String(fd.get("amount") ?? "").trim());
  if (!(value > 0)) return { error: "Enter an amount greater than zero." };

  const earnings = await getAffiliateEarnings(affiliate.id);
  if (value > earnings.available + 0.005) return { error: `You can request up to ${earnings.available}.` };

  const method = String(fd.get("method") ?? "Mobile Money");
  const reference = String(fd.get("reference") ?? "").trim();
  try {
    // One open request at a time. Without this, two submissions racing the
    // balance check above would both pass and together claim more than the
    // affiliate has cleared.
    const openRequest = await prisma.affiliatePayout.findFirst({
      where: { affiliateId: affiliate.id, status: "pending" },
      select: { id: true },
    });
    if (openRequest) {
      return { error: "You already have a payout request awaiting review." };
    }
    await prisma.affiliatePayout.create({
      data: { affiliateId: affiliate.id, amount: Math.round(value * 100) / 100, status: "pending", method, note: reference ? `Pay to: ${reference}` : "Requested by affiliate" },
    });
  } catch {
    return { error: "Couldn't submit your request. Please try again." };
  }
  revalidatePath("/affiliate");
  revalidatePath("/admin/finance");
  return { ok: true };
}
