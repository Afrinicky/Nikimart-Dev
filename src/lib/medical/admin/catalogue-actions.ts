"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { toDecimalString, toPesewas } from "@/lib/medical/money";
import { PURCHASE_MODES } from "@/lib/medical/purchase-mode";

/**
 * Changing the catalogue.
 *
 * Two rules worth stating because both are easy to get wrong:
 *
 *  - **Stock is never written here.** `stockOnHand` moves only through
 *    `inventory/stock.ts`, inside a transaction that writes a movement in the
 *    same breath, so the counter and the log can never disagree. A product form
 *    that let somebody type a stock figure would be the one place that rule
 *    could be broken, so it does not offer the field.
 *  - **Nothing is deleted.** A product that has been quoted or sold is
 *    referenced by documents that must keep rendering, so the end of a
 *    product's life is `ARCHIVED`, which hides it from the storefront and keeps
 *    every reference intact.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => toPesewas(text(f, k));
const int = (f: FormData, k: string, fallback = 0) => {
  const n = Number(text(f, k));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
};
const flag = (f: FormData, k: string) => text(f, k) === "1";

const STATUSES = ["DRAFT", "ACTIVE", "OUT_OF_STOCK", "DISCONTINUED", "ARCHIVED"];
const SOURCING = ["LOCAL", "IMPORT", "BOTH"];
const STORAGE = ["AMBIENT", "COOL", "REFRIGERATED", "FROZEN", "CONTROLLED"];

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "a unique field";
    return { ok: false, error: `Another product already uses that ${target}.` };
  }
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/**
 * Save a product's commercial and handling details.
 *
 * Only the fields a person maintains. Costs are included because procurement
 * maintains them, but `averageCost` is not: that is computed from the batches
 * on every goods receipt, and a typed figure would be overwritten by the next
 * delivery — which is worse than not offering it.
 */
export async function saveProduct(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("products", ["MANAGER", "SALES", "PROCUREMENT"]);
    const id = text(form, "id");
    if (!id) return { ok: false, error: "Missing product." };

    const status = text(form, "status");
    if (!STATUSES.includes(status)) return { ok: false, error: "Choose a status." };
    const purchaseMode = text(form, "purchaseMode");
    if (!PURCHASE_MODES.includes(purchaseMode as (typeof PURCHASE_MODES)[number])) {
      return { ok: false, error: "Choose how it may be bought." };
    }
    const sourcingMode = text(form, "sourcingMode");
    if (!SOURCING.includes(sourcingMode)) return { ok: false, error: "Choose how it is sourced." };
    const storageCondition = text(form, "storageCondition");
    if (!STORAGE.includes(storageCondition)) return { ok: false, error: "Choose a storage condition." };

    const name = text(form, "name");
    if (!name) return { ok: false, error: "A product needs a name." };

    const price = money(form, "price");
    if (price <= 0) return { ok: false, error: "A listed price is required." };

    const comparePrice = money(form, "comparePrice");
    const leadMin = int(form, "leadTimeMinDays", 2);
    const leadMax = int(form, "leadTimeMaxDays", 7);
    if (leadMax < leadMin) {
      return { ok: false, error: "The longest lead time cannot be shorter than the shortest." };
    }

    const restrictedSale = flag(form, "restrictedSale");
    const restrictionNote = text(form, "restrictionNote");
    if (restrictedSale && !restrictionNote) {
      return {
        ok: false,
        error: "Say what a customer must show. A restriction nobody can act on is not a restriction.",
      };
    }

    await medicalDb.$transaction(async (tx) => {
      const before = await tx.medicalProduct.findUniqueOrThrow({ where: { id } });

      await tx.medicalProduct.update({
        where: { id },
        data: {
          name,
          summary: text(form, "summary"),
          description: text(form, "description"),
          catalogueNumber: text(form, "catalogueNumber"),
          packSize: text(form, "packSize"),
          unitOfSale: text(form, "unitOfSale") || "unit",
          unitsPerPack: int(form, "unitsPerPack"),
          price: toDecimalString(price),
          // Null rather than zero: a struck-through price of nothing would
          // render as a discount from GH₵0.00.
          comparePrice: comparePrice > 0 ? toDecimalString(comparePrice) : null,
          minimumOrderQuantity: Math.max(1, int(form, "minimumOrderQuantity", 1)),
          purchaseCost: toDecimalString(money(form, "purchaseCost")),
          primarySupplierId: text(form, "primarySupplierId") || null,
          sourcingMode,
          internalNotes: text(form, "internalNotes"),
          purchaseMode,
          reorderLevel: int(form, "reorderLevel"),
          reorderQuantity: int(form, "reorderQuantity"),
          allowBackorder: flag(form, "allowBackorder"),
          tracksBatches: flag(form, "tracksBatches"),
          leadTimeMinDays: leadMin,
          leadTimeMaxDays: leadMax,
          storageCondition,
          handlingNotes: text(form, "handlingNotes"),
          requiresColdChain: flag(form, "requiresColdChain"),
          hazardClass: text(form, "hazardClass"),
          restrictedSale,
          restrictionNote,
          searchTerms: text(form, "searchTerms"),
          status,
        },
      });

      // Only what moved, and only the fields a person set. A diff of every
      // column would bury the one change somebody is looking for.
      const watched = [
        "name",
        "catalogueNumber",
        "price",
        "purchaseCost",
        "purchaseMode",
        "status",
        "reorderLevel",
        "restrictedSale",
      ] as const;
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const after = await tx.medicalProduct.findUniqueOrThrow({ where: { id } });
      for (const key of watched) {
        if (String(before[key]) !== String(after[key])) {
          changes[key] = { before: String(before[key]), after: String(after[key]) };
        }
      }

      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "MedicalProduct",
        entityId: id,
        summary: `Updated ${after.sku} — ${after.name}`,
        changes,
      });
    });

    revalidatePath("/medicals/admin/products");
    revalidatePath(`/medicals/admin/products/${id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failed(error, "The product could not be saved.");
  }
}

/**
 * Set a product's reorder point without opening the whole form.
 *
 * Its own action because it is the one field a buyer changes often, from the
 * inventory screen, while looking at what ran out — and making them open a
 * twenty-field form to type one number is how reorder levels stay at zero and
 * the low-stock report stays empty.
 */
export async function setReorderPoint(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("inventory", ["MANAGER", "PROCUREMENT", "STORES"]);
    const id = text(form, "productId");
    if (!id) return { ok: false, error: "Missing product." };

    const level = int(form, "reorderLevel");
    const quantity = int(form, "reorderQuantity");

    await medicalDb.$transaction(async (tx) => {
      const before = await tx.medicalProduct.findUniqueOrThrow({
        where: { id },
        select: { sku: true, name: true, reorderLevel: true, reorderQuantity: true },
      });
      await tx.medicalProduct.update({
        where: { id },
        data: { reorderLevel: level, reorderQuantity: quantity },
      });
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "MedicalProduct",
        entityId: id,
        summary: `Set the reorder point on ${before.sku} to ${level}, reordering ${quantity}`,
        changes: {
          reorderLevel: { before: before.reorderLevel, after: level },
          reorderQuantity: { before: before.reorderQuantity, after: quantity },
        },
      });
    });

    revalidatePath("/medicals/admin/inventory");
    revalidatePath(`/medicals/admin/products/${id}`);
    return { ok: true, message: "Reorder point saved." };
  } catch (error) {
    return failed(error, "The reorder point could not be saved.");
  }
}
