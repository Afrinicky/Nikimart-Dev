import "server-only";
import type { Prisma } from ".prisma/medical-client";
import { allocate, type BatchLike } from "@/lib/medical/inventory/allocation";
import { weightedAverageCost } from "@/lib/medical/procurement/landed-cost";
import { toDecimalString, toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * Every change to stock, posted the same way.
 *
 * Two rules, and nothing in the medical tree may break either:
 *
 *  1. **Nothing writes `stockOnHand` or `stockReserved` on its own.** Every
 *     change goes through this module, which inserts a `StockMovement` and
 *     updates the counter in the *same* transaction. The log is therefore
 *     always a complete explanation of the counter, which is the only way an
 *     inventory discrepancy can be investigated rather than argued about.
 *
 *  2. **Every function here takes a transaction client.** Not a convenience —
 *     a receipt that posts stock but fails to write its movement, or a
 *     dispatch that decrements the counter and then throws, leaves the
 *     business with figures nobody can reconcile. The caller owns the
 *     transaction because the caller knows what else has to succeed with it.
 *
 * Overselling is prevented by a conditional update rather than by reading the
 * figure and then writing it. Two orders for the last box, arriving in the
 * same second, both read "1 available" and both pass a check done in
 * application code; a single `UPDATE … WHERE available >= n` lets exactly one
 * of them through, because Postgres serialises the row.
 */

/** Raised when stock cannot cover what was asked for. Caught by callers. */
export class InsufficientStockError extends Error {
  constructor(
    readonly productId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(
      `Not enough stock: ${requested} requested, ${available} available. ` +
        `Reduce the quantity or source more before continuing.`,
    );
    this.name = "InsufficientStockError";
  }
}

export interface MovementSource {
  /** SALES_ORDER | PURCHASE_ORDER | GOODS_RECEIPT | QUOTATION | POS | MANUAL */
  sourceType: string;
  sourceId: string;
  staffId?: string | null;
  reason?: string;
}

// ---------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------

export interface ReceiveInput {
  productId: string;
  quantity: number;
  /** Landed cost of one unit, in pesewas. Not the invoice price. */
  unitCost: Pesewas;
  batchNumber?: string;
  expiryDate?: Date | null;
  supplierId?: string | null;
  goodsReceiptItemId?: string | null;
  /**
   * Whether the batch lands quarantined rather than sellable.
   *
   * The business runs accepted-straight-to-sellable, so this is false in the
   * ordinary path. It exists because the column does, and because a certificate
   * of analysis that has not arrived is a real reason to hold a reagent — the
   * caller decides, nothing here assumes.
   */
  quarantine?: boolean;
  quarantineReason?: string;
}

/**
 * Goods onto the shelf.
 *
 * Only ever the accepted quantity. Rejected and damaged units never touch
 * stock — they are recorded on the goods-received note so the claim against
 * the supplier has a number behind it, and that is all.
 *
 * Writes four things atomically: the batch, the counter, the movement, and the
 * product's running average cost with a cost-history row behind it. Margin on
 * a sale made in March is computed against what the goods cost in March, and
 * that is only true if the cost is recorded when the goods arrive.
 */
export async function receiveStock(
  tx: Prisma.TransactionClient,
  input: ReceiveInput,
  source: MovementSource,
): Promise<{ batchId: string; balanceAfter: number }> {
  const quantity = Math.trunc(input.quantity);
  if (quantity <= 0) {
    throw new Error("A receipt must be for at least one unit.");
  }

  const product = await tx.medicalProduct.findUnique({
    where: { id: input.productId },
    select: { id: true, stockOnHand: true, averageCost: true, tracksBatches: true },
  });
  if (!product) throw new Error("That product no longer exists.");

  const batch = await tx.stockBatch.create({
    data: {
      productId: input.productId,
      batchNumber: input.batchNumber ?? "",
      expiryDate: input.expiryDate ?? null,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unitCost: toDecimalString(input.unitCost),
      supplierId: input.supplierId ?? null,
      goodsReceiptItemId: input.goodsReceiptItemId ?? null,
      isQuarantined: input.quarantine ?? false,
      quarantineReason: input.quarantine ? (input.quarantineReason ?? "") : "",
    },
    select: { id: true },
  });

  const balanceAfter = product.stockOnHand + quantity;
  const nextAverage = weightedAverageCost(
    product.stockOnHand,
    toPesewas(product.averageCost),
    quantity,
    input.unitCost,
  );

  await tx.medicalProduct.update({
    where: { id: input.productId },
    data: {
      stockOnHand: { increment: quantity },
      averageCost: toDecimalString(nextAverage),
      // `status` is deliberately untouched. The storefront derives
      // availability from the figures, so a sold-out line becomes buyable
      // again the moment stock arrives without anything being republished —
      // and a DISCONTINUED or ARCHIVED line receiving a last delivery does not
      // quietly reappear in the catalogue.
    },
  });

  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      batchId: batch.id,
      kind: "RECEIPT",
      quantity,
      balanceAfter,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      reason: source.reason ?? "",
      staffId: source.staffId ?? null,
    },
  });

  await tx.productCostHistory.create({
    data: {
      productId: input.productId,
      supplierId: input.supplierId ?? null,
      unitCost: toDecimalString(input.unitCost),
      quantity,
      source: "GOODS_RECEIPT",
    },
  });

  return { batchId: batch.id, balanceAfter };
}

// ---------------------------------------------------------------------------
// Spoken for
// ---------------------------------------------------------------------------

/**
 * Move units from available to reserved.
 *
 * What an accepted quotation and a confirmed order do. Physical stock does not
 * change — the goods are still on the shelf — but they are no longer available
 * to anybody else, which is the distinction that stops the same box being sold
 * twice while it waits for a delivery run.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  source: MovementSource,
): Promise<number> {
  const wanted = Math.trunc(quantity);
  if (wanted <= 0) return 0;

  // Conditional update, column against column. Prisma's `where` cannot express
  // "stockOnHand - stockReserved >= n", and doing it as a read then a write is
  // exactly the race this has to survive.
  const updated = await tx.$executeRaw`
    UPDATE "medical_products"
       SET "stockReserved" = "stockReserved" + ${wanted}
     WHERE "id" = ${productId}
       AND ("stockOnHand" - "stockReserved") >= ${wanted}
  `;

  if (updated !== 1) {
    const current = await tx.medicalProduct.findUnique({
      where: { id: productId },
      select: { stockOnHand: true, stockReserved: true },
    });
    const available = current ? current.stockOnHand - current.stockReserved : 0;
    throw new InsufficientStockError(productId, wanted, Math.max(0, available));
  }

  const after = await tx.medicalProduct.findUniqueOrThrow({
    where: { id: productId },
    select: { stockOnHand: true },
  });

  await tx.stockMovement.create({
    data: {
      productId,
      kind: "RESERVATION",
      // Physical stock is unchanged; only the reserved figure moves. Recorded
      // as a reservedDelta so the log reads as what happened rather than as a
      // receipt and an issue that cancel out.
      quantity: 0,
      reservedDelta: wanted,
      balanceAfter: after.stockOnHand,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      reason: source.reason ?? "",
      staffId: source.staffId ?? null,
    },
  });

  return wanted;
}

/** Give reserved units back — a cancelled order, an expired quotation. */
export async function releaseReservation(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  source: MovementSource,
): Promise<number> {
  const wanted = Math.trunc(quantity);
  if (wanted <= 0) return 0;

  // GREATEST so a double release cannot drive the reservation negative, which
  // would make the product look more available than it is.
  await tx.$executeRaw`
    UPDATE "medical_products"
       SET "stockReserved" = GREATEST(0, "stockReserved" - ${wanted})
     WHERE "id" = ${productId}
  `;

  const after = await tx.medicalProduct.findUniqueOrThrow({
    where: { id: productId },
    select: { stockOnHand: true },
  });

  await tx.stockMovement.create({
    data: {
      productId,
      kind: "RELEASE",
      quantity: 0,
      reservedDelta: -wanted,
      balanceAfter: after.stockOnHand,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      reason: source.reason ?? "",
      staffId: source.staffId ?? null,
    },
  });

  return wanted;
}

// ---------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------

export interface DispatchResult {
  allocations: { batchId: string; quantity: number; unitCost: Pesewas }[];
  /** What the dispatched units cost, from the batches they came out of. */
  costOfGoods: Pesewas;
  balanceAfter: number;
}

/**
 * Goods out of the door.
 *
 * Consumes batches first-expiry-first-out, decrements the counter and the
 * reservation together, and returns what the goods cost so the order can
 * record its own cost of sale. The allocation is returned so it can be stored
 * on the order line — tracing a recall to the customers who received that
 * batch is the entire reason batches are tracked at all.
 */
export async function dispatchStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  source: MovementSource,
  options: { fromReservation?: boolean } = {},
): Promise<DispatchResult> {
  const wanted = Math.trunc(quantity);
  if (wanted <= 0) return { allocations: [], costOfGoods: 0, balanceAfter: 0 };

  const rows = await tx.stockBatch.findMany({
    where: { productId, quantityRemaining: { gt: 0 }, isQuarantined: false },
    select: {
      id: true,
      quantityRemaining: true,
      expiryDate: true,
      receivedAt: true,
      unitCost: true,
      isQuarantined: true,
    },
  });

  const batches: BatchLike[] = rows.map((row) => ({
    id: row.id,
    quantityRemaining: row.quantityRemaining,
    expiryDate: row.expiryDate,
    receivedAt: row.receivedAt,
    unitCost: toPesewas(row.unitCost),
    isQuarantined: row.isQuarantined,
  }));

  const plan = allocate(batches, wanted);
  if (plan.shortfall > 0) {
    throw new InsufficientStockError(productId, wanted, plan.allocated);
  }

  // The counter moves under the same condition the allocation assumed. Between
  // reading the batches and writing here another dispatch could have taken
  // them, and this is what catches it.
  const updated = await tx.$executeRaw`
    UPDATE "medical_products"
       SET "stockOnHand" = "stockOnHand" - ${wanted},
           "stockReserved" = GREATEST(0, "stockReserved" - ${
             options.fromReservation ? wanted : 0
           })
     WHERE "id" = ${productId}
       AND "stockOnHand" >= ${wanted}
  `;
  if (updated !== 1) {
    const current = await tx.medicalProduct.findUnique({
      where: { id: productId },
      select: { stockOnHand: true },
    });
    throw new InsufficientStockError(productId, wanted, Math.max(0, current?.stockOnHand ?? 0));
  }

  for (const allocation of plan.allocations) {
    await tx.stockBatch.update({
      where: { id: allocation.batchId },
      data: { quantityRemaining: { decrement: allocation.quantity } },
    });
  }

  const after = await tx.medicalProduct.findUniqueOrThrow({
    where: { id: productId },
    select: { stockOnHand: true },
  });

  // One movement per batch, so the log can answer which batch went where.
  for (const allocation of plan.allocations) {
    await tx.stockMovement.create({
      data: {
        productId,
        batchId: allocation.batchId,
        kind: source.sourceType === "POS" ? "POS_SALE" : "DISPATCH",
        quantity: -allocation.quantity,
        reservedDelta: options.fromReservation ? -allocation.quantity : 0,
        balanceAfter: after.stockOnHand,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        reason: source.reason ?? "",
        staffId: source.staffId ?? null,
      },
    });
  }

  return {
    allocations: plan.allocations,
    costOfGoods: plan.costOfGoods,
    balanceAfter: after.stockOnHand,
  };
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

/**
 * A counted difference, a breakage, an expiry write-off.
 *
 * Always with a reason, and always as a movement — an adjustment with no
 * explanation is the row that makes a whole stock log worthless. A negative
 * adjustment cannot take a product below zero.
 */
export async function adjustStock(
  tx: Prisma.TransactionClient,
  productId: string,
  delta: number,
  kind: "ADJUSTMENT" | "DAMAGE" | "EXPIRY" | "RETURN" | "OPENING",
  source: MovementSource & { reason: string },
  batchId?: string | null,
): Promise<number> {
  const change = Math.trunc(delta);
  if (change === 0) return 0;
  if (!source.reason.trim()) {
    throw new Error("An adjustment needs a reason.");
  }

  if (change < 0) {
    const updated = await tx.$executeRaw`
      UPDATE "medical_products"
         SET "stockOnHand" = "stockOnHand" + ${change}
       WHERE "id" = ${productId}
         AND "stockOnHand" >= ${Math.abs(change)}
    `;
    if (updated !== 1) {
      const current = await tx.medicalProduct.findUnique({
        where: { id: productId },
        select: { stockOnHand: true },
      });
      throw new InsufficientStockError(
        productId,
        Math.abs(change),
        Math.max(0, current?.stockOnHand ?? 0),
      );
    }
    if (batchId) {
      await tx.stockBatch.update({
        where: { id: batchId },
        data: { quantityRemaining: { decrement: Math.abs(change) } },
      });
    }
  } else {
    await tx.medicalProduct.update({
      where: { id: productId },
      data: { stockOnHand: { increment: change } },
    });
    if (batchId) {
      await tx.stockBatch.update({
        where: { id: batchId },
        data: { quantityRemaining: { increment: change } },
      });
    }
  }

  const after = await tx.medicalProduct.findUniqueOrThrow({
    where: { id: productId },
    select: { stockOnHand: true },
  });

  await tx.stockMovement.create({
    data: {
      productId,
      batchId: batchId ?? null,
      kind,
      quantity: change,
      balanceAfter: after.stockOnHand,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      reason: source.reason,
      staffId: source.staffId ?? null,
    },
  });

  return after.stockOnHand;
}

/** Free stock: what may actually be sold or promised today. */
export async function availableStock(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<number> {
  const row = await tx.medicalProduct.findUnique({
    where: { id: productId },
    select: { stockOnHand: true, stockReserved: true },
  });
  if (!row) return 0;
  return Math.max(0, row.stockOnHand - row.stockReserved);
}
