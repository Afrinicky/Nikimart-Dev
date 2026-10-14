"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { getSellerEarnings } from "@/lib/seller";
import type { CrudState } from "@/lib/admin-actions";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function amount(fd: FormData, key: string): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? n : NaN;
}

function revalidateFinance() {
  revalidatePath("/admin/finance");
  revalidatePath("/seller/settlements");
  revalidatePath("/seller");
}

// --- Seller payouts -------------------------------------------------------

/** Record a payout to a seller (marks it paid immediately — admin settled it). */
export async function createSellerPayout(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const vendorId = str(fd, "vendorId");
  const value = amount(fd, "amount");
  if (!vendorId) return { error: "Missing seller." };
  if (!(value > 0)) return { error: "Enter an amount greater than zero.", fieldErrors: { amount: "Required." } };

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) return { error: "Seller not found." };

  const earnings = await getSellerEarnings(vendorId);
  if (value > earnings.available + 0.005) {
    return { error: `Amount exceeds the available balance (${earnings.available}).`, fieldErrors: { amount: "Too high." } };
  }

  await prisma.payout.create({
    data: {
      vendorId,
      amount: Math.round(value * 100) / 100,
      status: "paid",
      method: str(fd, "method"),
      reference: str(fd, "reference") || null,
      note: str(fd, "note") || null,
      paidAt: new Date(),
    },
  });
  revalidateFinance();
  redirect("/admin/finance");
}

/** Mark a pending seller payout (e.g. a seller request) as paid. */
export async function markPayoutPaid(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.payout.updateMany({ where: { id, status: "pending" }, data: { status: "paid", paidAt: new Date() } });
  revalidateFinance();
}

// --- Affiliates -----------------------------------------------------------

export async function createAffiliate(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Affiliate name is required.", fieldErrors: { name: "Required." } };

  const code = str(fd, "code") || null;
  if (code) {
    const clash = await prisma.affiliate.findUnique({ where: { code } });
    if (clash) return { error: "That code is already in use.", fieldErrors: { code: "Already exists." } };
  }

  await prisma.affiliate.create({
    data: { name, phone: str(fd, "phone"), email: str(fd, "email"), code, note: str(fd, "note") },
  });
  revalidateFinance();
  redirect("/admin/affiliates");
}

/** Activate or suspend an affiliate. */
export async function setAffiliateStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || (status !== "active" && status !== "suspended")) return;
  await prisma.affiliate.update({ where: { id }, data: { status } });
  revalidateFinance();
  revalidatePath("/admin/affiliates");
  revalidatePath(`/admin/affiliates/${id}`);
  revalidatePath("/affiliate");
}

export type CommissionState = CrudState & { ok?: boolean };

/** Set a per-affiliate commission override (blank clears it). */
export async function setAffiliateCommission(_prev: CommissionState, fd: FormData): Promise<CommissionState> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return { error: "Missing affiliate." };
  const raw = str(fd, "commissionRate");
  let commissionRate: number | null = null;
  if (raw) {
    const n = Number(raw);
    if (!(n >= 0 && n <= 100)) return { error: "Rate must be between 0 and 100." };
    commissionRate = n;
  }
  await prisma.affiliate.update({ where: { id }, data: { commissionRate } });
  revalidatePath(`/admin/affiliates/${id}`);
  revalidatePath("/affiliate");
  return { ok: true };
}

export async function deleteAffiliate(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.affiliate.delete({ where: { id } }).catch(() => {});
    revalidateFinance();
  }
}

/**
 * Mark a pending affiliate payout (e.g. an affiliate's request) as paid.
 *
 * The commission lines the request claimed are settled in the same breath.
 * Without that the ledger would still count them as payable, and the affiliate
 * could ask to be paid for them again — the payout would be recorded and the
 * balance would not move.
 */
export async function markAffiliatePayoutPaid(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const flipped = await prisma.affiliatePayout.updateMany({
    where: { id, status: { in: ["pending", "processing"] } },
    data: { status: "paid", paidAt: new Date() },
  });
  if (flipped.count > 0) {
    await prisma.affiliateCommission
      .updateMany({ where: { payoutId: id }, data: { status: "paid" } })
      .catch(() => {});
  }
  revalidateFinance();
  revalidatePath("/affiliate");
  revalidatePath("/admin/affiliates/payouts");
}

/** Record a commission payment to an affiliate (marked paid). */
export async function createAffiliatePayout(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const affiliateId = str(fd, "affiliateId");
  const value = amount(fd, "amount");
  if (!affiliateId) return { error: "Missing affiliate." };
  if (!(value > 0)) return { error: "Enter an amount greater than zero.", fieldErrors: { amount: "Required." } };

  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } });
  if (!affiliate) return { error: "Affiliate not found." };

  const paid = Math.round(value * 100) / 100;
  const payout = await prisma.affiliatePayout.create({
    data: {
      affiliateId,
      amount: paid,
      status: "paid",
      method: str(fd, "method"),
      reference: str(fd, "reference") || null,
      note: str(fd, "note") || null,
      paidAt: new Date(),
    },
    select: { id: true },
  });

  /**
   * Settle the commission this payment covers.
   *
   * A payment recorded here is money that has actually left, so the lines it
   * covers have to stop being payable — otherwise the affiliate's console would
   * still offer the same commission for payout and the platform would pay it
   * twice. Oldest cleared first, up to the amount paid; a payment larger than
   * anything cleared simply settles what there is and the rest is a credit the
   * next cleared line meets.
   */
  const cleared = await prisma.affiliateCommission
    .findMany({
      where: { affiliateId, status: "cleared", payoutId: null },
      orderBy: { clearedAt: "asc" },
      select: { id: true, amount: true, reversedAmount: true },
    })
    .catch(() => [] as { id: string; amount: number; reversedAmount: number }[]);

  const covered: string[] = [];
  let running = 0;
  for (const line of cleared) {
    if (running >= paid - 0.005) break;
    covered.push(line.id);
    running += Math.max(0, line.amount - line.reversedAmount);
  }
  if (covered.length > 0) {
    await prisma.affiliateCommission
      .updateMany({ where: { id: { in: covered } }, data: { payoutId: payout.id, status: "paid" } })
      .catch(() => {});
  }

  revalidateFinance();
  redirect(`/admin/affiliates/${affiliateId}`);
}
