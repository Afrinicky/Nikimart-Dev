"use server";

import { revalidatePath } from "next/cache";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { adjustStock, InsufficientStockError } from "@/lib/medical/inventory/stock";

/**
 * Changing a stock figure by hand.
 *
 * The only route by which a counter moves without a delivery, a sale or a
 * dispatch behind it — and therefore the one that needs a reason on every
 * single call. `adjustStock` refuses a blank one, which is why this action can
 * hand the message straight back to the form rather than inventing a default.
 *
 * Why it exists at all: a count finds four fewer than the system says, a box is
 * dropped, a batch expires on the shelf. Those are real events and the system
 * has to be able to say so. What it must never be is a convenient way to make
 * the figures agree — hence the reason, the audit row, and the kinds below,
 * which make somebody say *what sort* of loss it was.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const KINDS = ["ADJUSTMENT", "DAMAGE", "EXPIRY", "RETURN", "OPENING"] as const;
type Kind = (typeof KINDS)[number];

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof InsufficientStockError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

export async function recordStockAdjustment(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("inventory", ["MANAGER", "STORES"]);
    const productId = text(form, "productId");
    const kind = text(form, "kind") as Kind;
    const reason = text(form, "reason");
    const batchId = text(form, "batchId") || null;

    if (!productId) return { ok: false, error: "Missing product." };
    if (!KINDS.includes(kind)) return { ok: false, error: "Say what kind of adjustment it is." };
    if (!reason) return { ok: false, error: "Give a reason. Every adjustment keeps one." };

    const raw = Number(text(form, "delta"));
    if (!Number.isFinite(raw) || Math.trunc(raw) === 0) {
      return { ok: false, error: "Enter how many units, positive or negative." };
    }
    // Damage, expiry and an opening balance each have only one sensible
    // direction, so the sign is taken from the kind rather than from whether
    // somebody remembered the minus. A keying slip should not add stock.
    const magnitude = Math.abs(Math.trunc(raw));
    const delta =
      kind === "DAMAGE" || kind === "EXPIRY"
        ? -magnitude
        : kind === "RETURN" || kind === "OPENING"
          ? magnitude
          : Math.trunc(raw);

    const result = await medicalDb.$transaction(async (tx) => {
      const product = await tx.medicalProduct.findUniqueOrThrow({
        where: { id: productId },
        select: { sku: true, name: true, stockOnHand: true },
      });

      const balanceAfter = await adjustStock(
        tx,
        productId,
        delta,
        kind,
        {
          sourceType: "MANUAL",
          sourceId: staff.staffId,
          staffId: staff.staffId,
          reason,
        },
        batchId,
      );

      await recordAudit(tx, staff, {
        action: "ADJUST",
        entity: "MedicalProduct",
        entityId: productId,
        summary: `${kind.toLowerCase()} of ${delta > 0 ? "+" : ""}${delta} on ${product.sku}: ${reason}`,
        changes: { before: product.stockOnHand, after: balanceAfter, kind },
      });

      return { balanceAfter, sku: product.sku };
    });

    revalidatePath("/medicals/admin/inventory");
    revalidatePath(`/medicals/admin/inventory/${productId}`);
    revalidatePath(`/medicals/admin/products/${productId}`);
    return {
      ok: true,
      message: `${result.sku} now reads ${result.balanceAfter}. The movement log explains why.`,
    };
  } catch (error) {
    return failed(error, "The adjustment could not be recorded.");
  }
}

/**
 * Quarantine a batch, or release it.
 *
 * Quarantined stock is physically present and not sellable. It stays in the
 * valuation and leaves availability, which is the honest reading: the money is
 * still tied up in it, and no customer can be promised it. Dropping it from
 * both would understate the stock on hand; keeping it in both would sell a
 * recalled batch.
 */
export async function setBatchQuarantine(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("inventory", ["MANAGER", "STORES"]);
    const batchId = text(form, "batchId");
    const quarantine = text(form, "quarantine") === "1";
    const reason = text(form, "reason");

    if (!batchId) return { ok: false, error: "Missing batch." };
    if (quarantine && !reason) {
      return { ok: false, error: "Say why it is being held. It stays on the batch." };
    }

    const productId = await medicalDb.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findUniqueOrThrow({
        where: { id: batchId },
        select: {
          id: true,
          batchNumber: true,
          productId: true,
          quantityRemaining: true,
          isQuarantined: true,
          product: { select: { sku: true } },
        },
      });
      if (batch.isQuarantined === quarantine) {
        throw new Error(quarantine ? "That batch is already held." : "That batch is not held.");
      }

      await tx.stockBatch.update({
        where: { id: batchId },
        data: { isQuarantined: quarantine, quarantineReason: quarantine ? reason : "" },
      });

      // No stock movement: nothing moved. The units are where they were and
      // the counter is unchanged — what changed is whether they may be sold,
      // and `allocate` reads `isQuarantined` when it picks batches.
      await recordAudit(tx, staff, {
        action: quarantine ? "CANCEL" : "APPROVE",
        entity: "StockBatch",
        entityId: batchId,
        summary: quarantine
          ? `Held batch ${batch.batchNumber || batch.id.slice(-6)} of ${batch.product.sku} (${batch.quantityRemaining} units): ${reason}`
          : `Released batch ${batch.batchNumber || batch.id.slice(-6)} of ${batch.product.sku} back to sale`,
      });

      return batch.productId;
    });

    revalidatePath("/medicals/admin/inventory");
    revalidatePath(`/medicals/admin/inventory/${productId}`);
    return {
      ok: true,
      message: quarantine
        ? "Held. It stays in the valuation and leaves availability."
        : "Released. It can be drawn again.",
    };
  } catch (error) {
    return failed(error, "The batch could not be changed.");
  }
}
