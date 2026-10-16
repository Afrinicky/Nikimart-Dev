"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { DISPUTE_STATUSES, PAYMENT_KINDS, PAYMENT_METHODS, safeUrl, signedGhs } from "@/lib/retail/purchase-fields";

/**
 * Keeping the supplier record straight.
 *
 * Admin-only, like placing the purchase itself: these write what Nickimart
 * believes it paid and what it holds as proof, which is the record a refund
 * would be argued from. A seller watching their own queue can see that their
 * goods were bought; they cannot say what was paid for them.
 *
 * Every write re-derives `amountPaid` from the payment rows rather than
 * adding to a running total. A figure that is incremented drifts the first
 * time a payment is corrected, and this one is the basis of "what is still
 * owed to this supplier".
 */

export type PurchaseState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string, max = 300): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function num(fd: FormData, key: string): number {
  const n = Number(String(fd.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function refresh(id: string) {
  revalidatePath(`/admin/orders/placement/purchase/${id}`);
  revalidatePath("/admin/orders/placement");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/transactions/procurement");
}

/** Re-add the payments and store the total on the purchase. */
async function restate(purchaseId: string): Promise<void> {
  const payments = await prisma.purchasePayment
    .findMany({ where: { purchaseId }, select: { kind: true, amountGhs: true } })
    .catch(() => []);
  const paid = Math.round(payments.reduce((s, p) => s + signedGhs(p), 0) * 100) / 100;
  await prisma.purchaseOrder
    .update({ where: { id: purchaseId }, data: { amountPaid: paid } })
    .catch(() => undefined);
}

/** The supplier's own details: their order number, the price agreed, the paperwork. */
export async function savePurchaseRecord(
  _prev: PurchaseState,
  fd: FormData,
): Promise<PurchaseState> {
  await requireAdmin();
  const id = str(fd, "id", 60);
  if (!id) return { error: "No purchase to save." };

  const expected = str(fd, "expectedAt", 20);
  const expectedAt = /^\d{4}-\d{2}-\d{2}$/.test(expected) ? new Date(`${expected}T00:00:00`) : null;

  try {
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierName: str(fd, "supplierName", 200),
        supplierContact: str(fd, "supplierContact", 200),
        supplierOrderNo: str(fd, "supplierOrderNo", 120),
        currency: str(fd, "currency", 8).toUpperCase(),
        fxRate: num(fd, "fxRate"),
        supplierCost: num(fd, "supplierCost"),
        invoiceUrl: safeUrl(str(fd, "invoiceUrl", 2000)),
        receiptUrl: safeUrl(str(fd, "receiptUrl", 2000)),
        agreementUrl: safeUrl(str(fd, "agreementUrl", 2000)),
        documents: str(fd, "documents", 4000),
        supplierTracking: str(fd, "supplierTracking", 200),
        supplierCarrier: str(fd, "supplierCarrier", 120),
        expectedAt,
        note: str(fd, "note", 1000),
      },
    });
  } catch {
    return { error: "Couldn't save that." };
  }

  refresh(id);
  return { ok: true, message: "Saved." };
}

/** Record money sent to the supplier — or sent back by them. */
export async function recordSupplierPayment(
  _prev: PurchaseState,
  fd: FormData,
): Promise<PurchaseState> {
  const admin = await requireAdmin();
  const purchaseId = str(fd, "purchaseId", 60);
  if (!purchaseId) return { error: "No purchase to pay against." };

  const purchase = await prisma.purchaseOrder
    .findUnique({ where: { id: purchaseId }, select: { currency: true, fxRate: true } })
    .catch(() => null);
  if (!purchase) return { error: "That purchase no longer exists." };

  const amount = num(fd, "amount");
  if (amount <= 0) return { error: "Enter what was paid." };

  const method = str(fd, "method", 20);
  if (!PAYMENT_METHODS.some((m) => m.value === method)) return { error: "Pick how it was paid." };
  const kind = str(fd, "kind", 20);
  if (!PAYMENT_KINDS.some((k) => k.value === kind)) return { error: "Pick what the payment was for." };

  // What actually left the account. Typed in where it was given, otherwise
  // converted at the purchase's own rate — never at today's, which would
  // restate a payment made months ago.
  const typedGhs = num(fd, "amountGhs");
  const currency = str(fd, "currency", 8).toUpperCase() || purchase.currency;
  const rate = num(fd, "fxRate") || purchase.fxRate;
  const amountGhs =
    typedGhs > 0 ? typedGhs : rate > 0 ? Math.round(amount * rate * 100) / 100 : amount;

  const paid = str(fd, "paidAt", 20);
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(paid) ? new Date(`${paid}T12:00:00`) : new Date();

  try {
    await prisma.purchasePayment.create({
      data: {
        purchaseId,
        amount,
        currency,
        amountGhs,
        method,
        kind,
        reference: str(fd, "reference", 200),
        receiptUrl: safeUrl(str(fd, "receiptUrl", 2000)),
        note: str(fd, "note", 500),
        paidAt,
        recordedById: admin.id,
      },
    });
  } catch {
    return { error: "Couldn't record that payment." };
  }

  await restate(purchaseId);
  refresh(purchaseId);
  return { ok: true, message: "Payment recorded." };
}

/** Remove a payment entered by mistake. */
export async function deleteSupplierPayment(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 60);
  if (!id) return;
  const row = await prisma.purchasePayment
    .findUnique({ where: { id }, select: { purchaseId: true } })
    .catch(() => null);
  if (!row) return;
  await prisma.purchasePayment.delete({ where: { id } }).catch(() => undefined);
  await restate(row.purchaseId);
  refresh(row.purchaseId);
}

/**
 * Flag a purchase that has gone wrong.
 *
 * The state that matters is whether money is still out there. "Raised" is a
 * live claim; "refunded" and "written off" are both endings, and the console
 * counts the first as recovered and the second as a loss.
 */
export async function setPurchaseDispute(
  _prev: PurchaseState,
  fd: FormData,
): Promise<PurchaseState> {
  await requireAdmin();
  const id = str(fd, "id", 60);
  const status = str(fd, "disputeStatus", 20);
  if (!id) return { error: "No purchase to flag." };
  if (!DISPUTE_STATUSES.some((d) => d.value === status)) return { error: "Pick a state." };

  try {
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        disputeStatus: status,
        disputeNote: str(fd, "disputeNote", 1000),
        disputeAt: status === "none" ? null : new Date(),
      },
    });
  } catch {
    return { error: "Couldn't save that." };
  }

  refresh(id);
  return { ok: true, message: status === "none" ? "Cleared." : "Saved." };
}
