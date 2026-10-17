"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { getSellerEarnings } from "@/lib/seller";
import { claimLinesForPayout, markLinesPaid } from "@/lib/affiliate-ledger";
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
  revalidatePath(`/admin/finance/settlements/${vendorId}`);
  revalidatePath("/admin/finance/settlements");
  redirect(`/admin/finance/settlements/${vendorId}?paid=1`);
}

/**
 * Reject a payout request a seller raised.
 *
 * Deleting it rather than flagging it: a request is an ask, not a ledger
 * entry, and the money it asked for goes straight back to payable. What
 * happened is a conversation, which belongs on WhatsApp rather than in a
 * status nobody reads.
 */
export async function rejectPayoutRequest(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const row = await prisma.payout
    .findUnique({ where: { id }, select: { vendorId: true, status: true } })
    .catch(() => null);
  if (!row || row.status !== "pending") return;
  await prisma.payout.deleteMany({ where: { id, status: "pending" } });
  revalidateFinance();
  revalidatePath(`/admin/finance/settlements/${row.vendorId}`);
  revalidatePath("/admin/finance/settlements");
}

/** Mark a pending seller payout (e.g. a seller request) as paid. */
export async function markPayoutPaid(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.payout.updateMany({ where: { id, status: "pending" }, data: { status: "paid", paidAt: new Date() } });
  revalidateFinance();
  revalidatePath("/admin/finance/settlements");
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
  if (flipped.count > 0) await markLinesPaid(id);
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
  await claimLinesForPayout(affiliateId, payout.id, paid);
  await markLinesPaid(payout.id);

  revalidateFinance();
  redirect(`/admin/affiliates/${affiliateId}`);
}
