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
  redirect("/admin/finance/affiliates");
}

export async function deleteAffiliate(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.affiliate.delete({ where: { id } }).catch(() => {});
    revalidateFinance();
  }
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

  await prisma.affiliatePayout.create({
    data: {
      affiliateId,
      amount: Math.round(value * 100) / 100,
      status: "paid",
      method: str(fd, "method"),
      reference: str(fd, "reference") || null,
      note: str(fd, "note") || null,
      paidAt: new Date(),
    },
  });
  revalidateFinance();
  redirect(`/admin/finance/affiliates/${affiliateId}`);
}
