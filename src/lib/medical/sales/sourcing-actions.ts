"use server";

import { revalidatePath } from "next/cache";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";

/**
 * Turning a shortfall into a sourcing round.
 *
 * The join between the selling side and the buying side. A confirmed order the
 * shelf cannot cover produces a list of what has to be bought — and that list
 * is a record rather than a message, because the things that should be bought
 * together are not the things that were sold together. Four orders short of
 * the same reagent is one supplier order, and pooling them here is the only
 * way to see it.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

export interface Shortfall {
  salesOrderItemId: string;
  productId: string | null;
  description: string;
  ordered: number;
  available: number;
  short: number;
  unit: string;
}

/**
 * What a confirmed order cannot be filled from stock.
 *
 * Free stock, not physical: units already reserved for somebody else are not
 * available, and treating them as available is how the same box is promised
 * twice. The order's own reservation is added back, so re-running this on an
 * order that is already reserved does not report a shortfall that is not there.
 */
export async function shortfallFor(salesOrderId: string): Promise<Shortfall[]> {
  const order = await medicalDb.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, stockOnHand: true, stockReserved: true, unitOfSale: true },
          },
        },
      },
    },
  });
  if (!order) return [];

  // Annotated, or TypeScript infers the union from the first branch and
  // decides productId is always null.
  return order.items.flatMap((item): Shortfall[] => {
    const needed = item.quantity - item.quantityDispatched;
    if (needed <= 0) return [];

    // A custom line with no catalogue product has to be sourced in full.
    if (!item.product) {
      return [
        {
          salesOrderItemId: item.id,
          productId: null,
          description: item.description,
          ordered: needed,
          available: 0,
          short: needed,
          unit: item.unit,
        },
      ];
    }

    const free =
      item.product.stockOnHand - item.product.stockReserved + item.quantityReserved;
    const short = Math.max(0, needed - Math.max(0, free));
    if (short <= 0) return [];

    return [
      {
        salesOrderItemId: item.id,
        productId: item.product.id,
        description: item.description,
        ordered: needed,
        available: Math.max(0, free),
        short,
        unit: item.unit,
      },
    ];
  });
}

/**
 * Open a sourcing round for what an order is short of.
 *
 * Does not buy anything. It records what must be bought, so a buyer can gather
 * supplier quotations against it, compare them on landed cost, and raise one
 * purchase order covering several customers.
 */
export async function createSourcingFromOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("sourcing");
    const salesOrderId = text(form, "salesOrderId");
    if (!salesOrderId) return { ok: false, error: "Missing order." };

    const shortfall = await shortfallFor(salesOrderId);
    if (shortfall.length === 0) {
      return { ok: false, error: "Everything on this order can be filled from stock." };
    }

    const id = await medicalDb.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUniqueOrThrow({
        where: { id: salesOrderId },
        select: { id: true, reference: true, placedAt: true },
      });

      const reference = await nextReference(tx, "SOURCING");
      const request = await tx.sourcingRequest.create({
        data: {
          reference,
          reason: "CUSTOMER_ORDER",
          salesOrderId,
          status: "OPEN",
          neededBy: null,
          priority: text(form, "priority") || "NORMAL",
          notes: text(form, "notes"),
          createdById: staff.staffId,
        },
      });

      for (const [index, line] of shortfall.entries()) {
        await tx.sourcingRequestItem.create({
          data: {
            sourcingRequestId: request.id,
            productId: line.productId,
            description: line.description,
            quantity: line.short,
            unit: line.unit,
            // Line level, because one supplier order serves several customers
            // and anything coarser cannot answer "whose goods are these" when
            // the delivery arrives short.
            salesOrderItemId: line.salesOrderItemId,
            position: index * 10,
          },
        });
      }

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "SourcingRequest",
        entityId: request.id,
        summary: `Opened ${reference} for ${shortfall.length} short lines on ${order.reference}`,
      });

      return request.id;
    });

    revalidatePath("/medicals/admin/sourcing");
    revalidatePath(`/medicals/admin/customer-orders/${salesOrderId}`);
    return { ok: true, id, message: "Sourcing round opened. Nothing has been ordered yet." };
  } catch (error) {
    return failed(error, "The sourcing round could not be opened.");
  }
}

/** Open a round for stock replenishment, unrelated to any one customer. */
export async function createReplenishmentSourcing(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("sourcing");
    const productIds = form.getAll("productId").map(String).filter(Boolean);
    if (productIds.length === 0) return { ok: false, error: "Choose at least one product." };

    const id = await medicalDb.$transaction(async (tx) => {
      const reference = await nextReference(tx, "SOURCING");
      const request = await tx.sourcingRequest.create({
        data: {
          reference,
          reason: "STOCK_REPLENISHMENT",
          status: "OPEN",
          priority: text(form, "priority") || "NORMAL",
          notes: text(form, "notes"),
          createdById: staff.staffId,
        },
      });

      const products = await tx.medicalProduct.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unitOfSale: true, reorderQuantity: true, reorderLevel: true },
      });

      for (const [index, product] of products.entries()) {
        await tx.sourcingRequestItem.create({
          data: {
            sourcingRequestId: request.id,
            productId: product.id,
            description: product.name,
            // The reorder quantity the product itself carries, falling back to
            // the reorder level. Buying an arbitrary number is how a shelf ends
            // up with eighteen months of a reagent that expires in six.
            quantity: Math.max(1, product.reorderQuantity || product.reorderLevel || 1),
            unit: product.unitOfSale,
            position: index * 10,
          },
        });
      }

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "SourcingRequest",
        entityId: request.id,
        summary: `Opened ${reference} to replenish ${products.length} lines`,
      });

      return request.id;
    });

    revalidatePath("/medicals/admin/sourcing");
    return { ok: true, id };
  } catch (error) {
    return failed(error, "The sourcing round could not be opened.");
  }
}

/** Request prices from a supplier against a sourcing round. */
export async function requestSupplierQuote(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("supplier-quotes");
    const sourcingRequestId = text(form, "sourcingRequestId");
    const supplierId = text(form, "supplierId");
    if (!sourcingRequestId || !supplierId) {
      return { ok: false, error: "Choose a supplier." };
    }

    const id = await medicalDb.$transaction(async (tx) => {
      const [supplier, items] = await Promise.all([
        tx.supplier.findUniqueOrThrow({
          where: { id: supplierId },
          select: { id: true, name: true, currency: true },
        }),
        tx.sourcingRequestItem.findMany({
          where: { sourcingRequestId },
          orderBy: { position: "asc" },
        }),
      ]);

      const reference = await nextReference(tx, "SUPPLIER_QUOTE");
      const quote = await tx.supplierQuote.create({
        data: {
          reference,
          supplierId,
          sourcingRequestId,
          status: "REQUESTED",
          currency: supplier.currency,
          exchangeRate: "1",
          notes: text(form, "notes"),
        },
      });

      for (const item of items) {
        await tx.supplierQuoteItem.create({
          data: {
            supplierQuoteId: quote.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitCost: "0",
          },
        });
      }

      await tx.sourcingRequest.update({
        where: { id: sourcingRequestId },
        data: { status: "QUOTING" },
      });

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "SupplierQuote",
        entityId: quote.id,
        summary: `Requested prices from ${supplier.name} (${reference})`,
      });

      return quote.id;
    });

    revalidatePath(`/medicals/admin/sourcing/${sourcingRequestId}`);
    return { ok: true, id };
  } catch (error) {
    return failed(error, "The request could not be sent.");
  }
}

/** Enter what a supplier came back with. */
export async function recordSupplierQuoteReply(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("supplier-quotes");
    const quoteId = text(form, "quoteId");

    await medicalDb.$transaction(async (tx) => {
      const quote = await tx.supplierQuote.findUniqueOrThrow({
        where: { id: quoteId },
        include: { items: true },
      });

      for (const item of quote.items) {
        const raw = String(form.get(`cost:${item.id}`) ?? "").trim();
        if (!raw) continue;
        const lead = Number(form.get(`lead:${item.id}`) ?? 0);
        await tx.supplierQuoteItem.update({
          where: { id: item.id },
          data: {
            unitCost: raw,
            leadTimeDays: Number.isFinite(lead) ? Math.max(0, Math.trunc(lead)) : 0,
          },
        });
      }

      const validUntilRaw = text(form, "validUntil");
      const dutyPercent = Number(form.get("dutyPercent") ?? 0);

      await tx.supplierQuote.update({
        where: { id: quoteId },
        data: {
          status: "RECEIVED",
          receivedAt: new Date(),
          validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
          currency: text(form, "currency") || quote.currency,
          // Recorded at the moment the quote is entered, never looked up at
          // comparison time: comparing a March quote at today's rate is how a
          // margin disappears between the decision and the payment.
          exchangeRate: text(form, "exchangeRate") || "1",
          // Everything between their gate and our shelf. Blank means zero and
          // the comparison marks an import quote with nothing stated as not
          // fully costed, rather than ranking it as though freight were free.
          freight: text(form, "freight") || "0",
          insurance: text(form, "insurance") || "0",
          otherCharges: text(form, "otherCharges") || "0",
          // Entered as a percentage because that is how a tariff is published,
          // stored as basis points because that is how `applyRate` works and
          // because 12.5% cannot be held in an integer percent.
          dutyRateBp: Number.isFinite(dutyPercent)
            ? Math.max(0, Math.round(dutyPercent * 100))
            : 0,
          clearingGhs: text(form, "clearingGhs") || "0",
          otherGhs: text(form, "otherGhs") || "0",
          notes: text(form, "notes") || quote.notes,
        },
      });

      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "SupplierQuote",
        entityId: quoteId,
        summary: `Recorded reply to ${quote.reference}`,
      });
    });

    revalidatePath("/medicals/admin/sourcing");
    return { ok: true };
  } catch (error) {
    return failed(error, "The reply could not be recorded.");
  }
}
