"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";
import { receiveStock } from "@/lib/medical/inventory/stock";
import { apportionLandedCosts } from "@/lib/medical/procurement/landed-cost";
import { matchInvoice, settlementStatus } from "@/lib/medical/procurement/matching";
import { postTransaction } from "@/lib/medical/finance/ledger";
import {
  lineAmount,
  sum,
  toDecimalString,
  toPesewas,
  type MoneyInput,
  type Pesewas,
} from "@/lib/medical/money";

/**
 * Everything that writes on the procurement side.
 *
 * Three rules hold across every function in this file:
 *
 *  - **One transaction per business event.** A goods receipt posts stock,
 *    updates batches, writes movements, advances the purchase order and
 *    records the cost — and either all of that happens or none of it does.
 *    Half a receipt is figures nobody can reconcile.
 *  - **Authorisation at the write, not at the button.** Every action calls
 *    `requireMedicalRole` with the section it belongs to. A form is a
 *    suggestion; the server decides.
 *  - **An audit row inside the same transaction.** Committed separately it
 *    could describe a change that was rolled back, or be missing for one that
 *    was not.
 *
 * Actions return `{ ok }` or `{ error }` rather than throwing into the form,
 * so a failure can be shown next to the field that caused it.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "";
    // The partial unique index on (supplierId, supplierReference). The one
    // duplicate that actually costs money, so it gets its own sentence.
    if (target.includes("supplierReference") || String(error.message).includes("supplier_ref")) {
      return {
        ok: false,
        error:
          "This supplier already has an invoice with that number. Open the existing one rather than recording it twice.",
      };
    }
    return { ok: false, error: `Something with that ${target || "reference"} already exists.` };
  }
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string): number => {
  const value = Number(String(form.get(key) ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
};
const money = (form: FormData, key: string): Pesewas => toPesewas(text(form, key));
const date = (form: FormData, key: string): Date | null => {
  const raw = text(form, key);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function saveSupplier(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("suppliers");
    const id = text(form, "id");
    const name = text(form, "name");
    if (!name) return { ok: false, error: "A supplier needs a name." };

    const data = {
      name,
      kind: text(form, "kind") || "LOCAL",
      country: text(form, "country") || "Ghana",
      currency: text(form, "currency") || "GHS",
      contactName: text(form, "contactName"),
      email: text(form, "email"),
      phone: text(form, "phone"),
      website: text(form, "website"),
      addressLine1: text(form, "addressLine1"),
      city: text(form, "city"),
      region: text(form, "region"),
      leadTimeDays: Math.max(0, num(form, "leadTimeDays")),
      minimumOrderValue: toDecimalString(money(form, "minimumOrderValue")),
      paymentTermsDays: Math.max(0, num(form, "paymentTermsDays")),
      paymentDetails: text(form, "paymentDetails"),
      notes: text(form, "notes"),
      rating: Math.min(5, Math.max(0, num(form, "rating"))),
      isActive: text(form, "isActive") !== "0",
    };

    const result = await medicalDb.$transaction(async (tx) => {
      if (id) {
        const before = await tx.supplier.findUniqueOrThrow({ where: { id } });
        const row = await tx.supplier.update({ where: { id }, data });
        await recordAudit(tx, staff, {
          action: "UPDATE",
          entity: "Supplier",
          entityId: id,
          summary: `Updated supplier ${before.name}`,
        });
        return row;
      }

      // The code is generated rather than typed: a supplier code somebody
      // invents collides the first time two people add the same supplier.
      const code = await uniqueSupplierCode(tx, name);
      const row = await tx.supplier.create({ data: { ...data, code } });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "Supplier",
        entityId: row.id,
        summary: `Added supplier ${name}`,
      });
      return row;
    });

    revalidatePath("/medicals/admin/suppliers");
    return { ok: true, id: result.id };
  } catch (error) {
    return failed(error, "The supplier could not be saved.");
  }
}

async function uniqueSupplierCode(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4)
      .padEnd(3, "X") || "SUP";
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const code = `${base}-${String(suffix).padStart(3, "0")}`;
    const taken = await tx.supplier.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  return `SUP-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

/**
 * Raise a draft purchase order on a supplier.
 *
 * Draft, always. A purchase order that goes straight to "sent" is money
 * committed by whoever happened to open the form; `approvePurchaseOrder` is
 * the deliberate second step, and it is restricted to the roles accountable
 * for spending.
 */
export async function createPurchaseOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("purchase-orders");
    const chosenSupplierId = text(form, "supplierId");
    const sourcingRequestId = text(form, "sourcingRequestId") || null;
    // The quotation this order is being placed against, where the buyer picked
    // one. Its prices and its rate are what the order is raised at — re-pricing
    // from the catalogue here would quietly discard the comparison the buyer
    // just made. Picking a quotation names the supplier too, so the sourcing
    // screen can offer one choice rather than two that must agree.
    const supplierQuoteId = text(form, "supplierQuoteId") || null;
    if (!chosenSupplierId && !supplierQuoteId) {
      return { ok: false, error: "Choose a supplier." };
    }

    const result = await medicalDb.$transaction(async (tx) => {
      const quote = supplierQuoteId
        ? await tx.supplierQuote.findUnique({
            where: { id: supplierQuoteId },
            include: { items: true },
          })
        : null;
      if (supplierQuoteId && !quote) throw new Error("That quotation no longer exists.");
      if (quote && chosenSupplierId && quote.supplierId !== chosenSupplierId) {
        throw new Error("That quotation belongs to a different supplier.");
      }

      const supplierId = chosenSupplierId || quote?.supplierId;
      if (!supplierId) throw new Error("Choose a supplier.");
      const supplier = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { id: true, name: true, currency: true, leadTimeDays: true },
      });

      const reference = await nextReference(tx, "PO");
      const expectedAt = date(form, "expectedAt");

      const order = await tx.purchaseOrder.create({
        data: {
          reference,
          supplierId,
          supplierQuoteId: quote?.id ?? null,
          status: "DRAFT",
          currency: text(form, "currency") || quote?.currency || supplier.currency,
          exchangeRate:
            toDecimalString(money(form, "exchangeRate")) ||
            (quote ? String(quote.exchangeRate) : "1"),
          expectedAt:
            expectedAt ??
            new Date(Date.now() + Math.max(1, supplier.leadTimeDays) * 86_400_000),
          notes: text(form, "notes"),
          createdById: staff.staffId,
        },
      });

      // Lines come from a sourcing round where there is one, so the buyer does
      // not retype what the shortfall already says.
      if (sourcingRequestId) {
        const items = await tx.sourcingRequestItem.findMany({
          where: { sourcingRequestId, status: { in: ["OPEN", "QUOTING"] } },
          include: { product: { select: { purchaseCost: true, unitOfSale: true } } },
        });

        // The quoted price for a line, matched on the product where both
        // sides have one and on the wording otherwise — a supplier's own
        // description is often all a non-catalogue line has.
        const quoted = (productId: string | null, description: string) => {
          if (!quote) return null;
          const line =
            (productId ? quote.items.find((q) => q.productId === productId) : undefined) ??
            quote.items.find((q) => q.description === description);
          return line ? toPesewas(line.unitCost) : null;
        };

        for (const item of items) {
          const outstanding = Math.max(0, item.quantity - item.quantityOrdered);
          if (outstanding <= 0) continue;
          const unitCost =
            quoted(item.productId, item.description) ??
            toPesewas(item.product?.purchaseCost ?? 0);
          await tx.purchaseOrderItem.create({
            data: {
              purchaseOrderId: order.id,
              productId: item.productId,
              description: item.description,
              quantity: outstanding,
              unitCost: toDecimalString(unitCost),
              lineTotal: toDecimalString(lineAmount(outstanding, unitCost)),
              sourcingRequestItemId: item.id,
              salesOrderItemId: item.salesOrderItemId,
            },
          });
          await tx.sourcingRequestItem.update({
            where: { id: item.id },
            data: { quantityOrdered: { increment: outstanding }, status: "ORDERED" },
          });
        }

        await tx.sourcingRequest.update({
          where: { id: sourcingRequestId },
          data: { status: "ORDERED" },
        });
      }

      await recalculatePurchaseOrder(tx, order.id);
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "PurchaseOrder",
        entityId: order.id,
        summary: `Raised ${reference} on ${supplier.name}`,
      });

      return order;
    });

    revalidatePath("/medicals/admin/purchase-orders");
    return { ok: true, id: result.id };
  } catch (error) {
    return failed(error, "The purchase order could not be created.");
  }
}

export async function addPurchaseOrderItem(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("purchase-orders");
    const purchaseOrderId = text(form, "purchaseOrderId");
    const description = text(form, "description");
    const quantity = Math.max(1, num(form, "quantity"));
    const unitCost = money(form, "unitCost");
    if (!purchaseOrderId || !description) {
      return { ok: false, error: "A line needs a description." };
    }

    await medicalDb.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrderId },
        select: { id: true, status: true, reference: true },
      });
      // An order the supplier has already seen is not edited in place. The
      // quantity they confirmed is the quantity we are owed.
      if (order.status !== "DRAFT") {
        throw new Error("This order has already been sent. Raise an amendment instead.");
      }

      await tx.purchaseOrderItem.create({
        data: {
          purchaseOrderId,
          productId: text(form, "productId") || null,
          description,
          supplierSku: text(form, "supplierSku"),
          quantity,
          unitCost: toDecimalString(unitCost),
          lineTotal: toDecimalString(lineAmount(quantity, unitCost)),
        },
      });

      await recalculatePurchaseOrder(tx, purchaseOrderId);
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: purchaseOrderId,
        summary: `Added "${description}" to ${order.reference}`,
      });
    });

    revalidatePath(`/medicals/admin/purchase-orders/${purchaseOrderId}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The line could not be added.");
  }
}

/** Landed-cost estimates and actuals, which decide what goes into inventory. */
export async function savePurchaseOrderCosts(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("purchase-orders");
    const id = text(form, "purchaseOrderId");
    if (!id) return { ok: false, error: "Missing purchase order." };

    await medicalDb.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          exchangeRate: toDecimalString(money(form, "exchangeRate")) || "1",
          shippingEstimate: toDecimalString(money(form, "shippingEstimate")),
          shippingActual: toDecimalString(money(form, "shippingActual")),
          dutyEstimate: toDecimalString(money(form, "dutyEstimate")),
          dutyActual: toDecimalString(money(form, "dutyActual")),
          clearingEstimate: toDecimalString(money(form, "clearingEstimate")),
          clearingActual: toDecimalString(money(form, "clearingActual")),
          otherEstimate: toDecimalString(money(form, "otherEstimate")),
          otherActual: toDecimalString(money(form, "otherActual")),
          costsConfirmed: text(form, "costsConfirmed") === "1",
        },
      });
      await recalculatePurchaseOrder(tx, id);
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: id,
        summary: "Updated landed costs",
      });
    });

    revalidatePath(`/medicals/admin/purchase-orders/${id}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The costs could not be saved.");
  }
}

/**
 * Totals, and each line's share of the landed costs.
 *
 * Recomputed from the lines on every change rather than adjusted in place, so
 * a total can never drift away from what it is the sum of. Actuals are used
 * where they have been entered and estimates stand in until then — and the
 * order says which it is, because a report that mixes the two is a report
 * nobody trusts.
 */
async function recalculatePurchaseOrder(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
): Promise<void> {
  const order = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId },
    include: { items: true },
  });

  const lines = order.items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    unitCost: toPesewas(item.unitCost),
  }));
  const subtotal = sum(lines.map((line) => lineAmount(line.quantity, line.unitCost)));

  // The actual where it has been entered, the estimate until then. Typed as
  // MoneyInput rather than unknown so a Decimal column passes without a cast.
  const pick = (actual: MoneyInput, estimate: MoneyInput): Pesewas => {
    const a = toPesewas(actual);
    return a > 0 ? a : toPesewas(estimate);
  };
  const landedCharges =
    pick(order.shippingActual, order.shippingEstimate) +
    pick(order.dutyActual, order.dutyEstimate) +
    pick(order.clearingActual, order.clearingEstimate) +
    pick(order.otherActual, order.otherEstimate);

  const rate = toPesewas(order.exchangeRate) || 100;
  // Goods are in the supplier's currency; the charges above are already GH₵.
  const subtotalGhs = Math.round((subtotal * rate) / 100);
  const totalLandedGhs = subtotalGhs + landedCharges;

  const shares = apportionLandedCosts(lines, landedCharges);
  for (const share of shares) {
    const line = lines.find((l) => l.id === share.id)!;
    await tx.purchaseOrderItem.update({
      where: { id: share.id },
      data: {
        lineTotal: toDecimalString(lineAmount(line.quantity, line.unitCost)),
        landedUnitCostGhs: toDecimalString(share.landedUnitCost),
      },
    });
  }

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      subtotal: toDecimalString(subtotal),
      totalLandedGhs: toDecimalString(totalLandedGhs),
    },
  });
}

/** Approve and send. Restricted to the roles accountable for spending. */
export async function approvePurchaseOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("purchase-orders", ["MANAGER", "FINANCE"]);
    const id = text(form, "purchaseOrderId");

    await medicalDb.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: { items: { select: { id: true } }, supplier: { select: { name: true } } },
      });
      if (order.status !== "DRAFT") throw new Error("This order has already been approved.");
      if (order.items.length === 0) throw new Error("An order with no lines cannot be sent.");

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "SENT", orderedAt: new Date() },
      });

      // On-order stock, so the catalogue can tell the difference between "we
      // have none" and "we have none and forty are coming".
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id, productId: { not: null } },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.medicalProduct.update({
          where: { id: item.productId! },
          data: { stockOnOrder: { increment: item.quantity } },
        });
      }

      await recordAudit(tx, staff, {
        action: "APPROVE",
        entity: "PurchaseOrder",
        entityId: id,
        summary: `Approved and sent ${order.reference} to ${order.supplier.name}`,
      });
    });

    revalidatePath(`/medicals/admin/purchase-orders/${id}`);
    revalidatePath("/medicals/admin/purchase-orders");
    return { ok: true };
  } catch (error) {
    return failed(error, "The order could not be approved.");
  }
}

// ---------------------------------------------------------------------------
// Goods received
// ---------------------------------------------------------------------------

/**
 * Record a delivery.
 *
 * The one place in the system where stock comes into existence, and the
 * reason it is a single transaction: a receipt writes a goods-received note,
 * a batch per accepted line, a stock movement per batch, the product's running
 * average cost, a cost-history row, the purchase-order line's received figure,
 * the order's own status, the sourcing item behind it, and a ledger entry for
 * the value received. If any of that fails, none of it happened.
 *
 * Only the **accepted** quantity enters stock. Rejected and damaged units are
 * recorded against the line so the claim against the supplier has a number
 * behind it, and they never touch inventory.
 */
export async function recordGoodsReceipt(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("goods-received");
    const purchaseOrderId = text(form, "purchaseOrderId");
    if (!purchaseOrderId) return { ok: false, error: "Missing purchase order." };

    const lines = parseReceiptLines(form);
    if (lines.length === 0) {
      return { ok: false, error: "Enter at least one quantity before recording the delivery." };
    }

    const receiptId = await medicalDb.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrderId },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });
      if (order.status === "DRAFT") {
        throw new Error("This order has not been sent yet.");
      }
      if (order.status === "CANCELLED") {
        throw new Error("This order was cancelled.");
      }

      const reference = await nextReference(tx, "GRN");
      const receipt = await tx.goodsReceipt.create({
        data: {
          reference,
          purchaseOrderId,
          receivedById: staff.staffId,
          deliveryNote: text(form, "deliveryNote"),
          notes: text(form, "notes"),
        },
      });

      let valueReceived: Pesewas = 0;

      for (const line of lines) {
        const orderItem = order.items.find((item) => item.id === line.purchaseOrderItemId);
        if (!orderItem) continue;

        // Guard against receiving more than was ordered across several
        // deliveries. A supplier who over-ships is a conversation, not a
        // silent increase in what we owe.
        const alreadyAccepted = orderItem.quantityReceived;
        const remaining = Math.max(0, orderItem.quantity - alreadyAccepted);
        if (line.accepted > remaining) {
          throw new Error(
            `${orderItem.description}: ${line.accepted} accepted but only ${remaining} are outstanding on this order.`,
          );
        }

        const receiptItem = await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            purchaseOrderItemId: orderItem.id,
            quantityAccepted: line.accepted,
            quantityRejected: line.rejected,
            rejectionReason: line.rejectionReason,
            batchNumber: line.batchNumber || null,
            expiryDate: line.expiryDate,
          },
        });

        if (line.accepted > 0 && orderItem.productId) {
          // The landed unit cost, not the invoice price: freight, duty and
          // clearing are already apportioned over the lines, and valuing stock
          // at the supplier's price overstates every margin downstream.
          const unitCost =
            toPesewas(orderItem.landedUnitCostGhs) > 0
              ? toPesewas(orderItem.landedUnitCostGhs)
              : toPesewas(orderItem.unitCost);

          const { batchId } = await receiveStock(
            tx,
            {
              productId: orderItem.productId,
              quantity: line.accepted,
              unitCost,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate,
              supplierId: order.supplier.id,
              goodsReceiptItemId: receiptItem.id,
            },
            {
              sourceType: "GOODS_RECEIPT",
              sourceId: receipt.id,
              staffId: staff.staffId,
              reason: `Received against ${order.reference}`,
            },
          );

          await tx.goodsReceiptItem.update({
            where: { id: receiptItem.id },
            data: { stockBatchId: batchId },
          });

          await tx.medicalProduct.update({
            where: { id: orderItem.productId },
            data: { stockOnOrder: { decrement: Math.min(line.accepted, orderItem.quantity) } },
          });

          valueReceived += line.accepted * unitCost;
        }

        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { quantityReceived: { increment: line.accepted } },
        });

        // Tell the sourcing round, so somebody watching a customer order can
        // see their goods have landed without opening the purchase order.
        if (orderItem.sourcingRequestItemId && line.accepted > 0) {
          const sourcingItem = await tx.sourcingRequestItem.update({
            where: { id: orderItem.sourcingRequestItemId },
            data: { quantityReceived: { increment: line.accepted } },
            select: { id: true, quantity: true, quantityReceived: true, sourcingRequestId: true },
          });
          await tx.sourcingRequestItem.update({
            where: { id: sourcingItem.id },
            data: {
              status:
                sourcingItem.quantityReceived >= sourcingItem.quantity
                  ? "RECEIVED"
                  : "PARTIALLY_RECEIVED",
            },
          });
        }
      }

      await advancePurchaseOrderStatus(tx, purchaseOrderId);
      await advanceSourcingFromOrder(tx, purchaseOrderId);

      if (valueReceived > 0) {
        await postTransaction(tx, {
          kind: "PURCHASE",
          direction: "DEBIT",
          amount: valueReceived,
          sourceType: "GOODS_RECEIPT",
          sourceId: receipt.id,
          description: `Goods received ${reference} against ${order.reference}`,
          recordedById: staff.staffId,
        });
      }

      await recordAudit(tx, staff, {
        action: "RECEIVE",
        entity: "GoodsReceipt",
        entityId: receipt.id,
        summary: `Recorded ${reference} against ${order.reference}`,
        changes: {
          accepted: sum(lines.map((l) => l.accepted)),
          rejected: sum(lines.map((l) => l.rejected)),
        },
      });

      return receipt.id;
    });

    revalidatePath(`/medicals/admin/purchase-orders/${purchaseOrderId}`);
    revalidatePath("/medicals/admin/goods-received");
    revalidatePath("/medicals/admin/inventory");
    return { ok: true, id: receiptId };
  } catch (error) {
    return failed(error, "The delivery could not be recorded.");
  }
}

interface ReceiptLine {
  purchaseOrderItemId: string;
  accepted: number;
  rejected: number;
  rejectionReason: string;
  batchNumber: string;
  expiryDate: Date | null;
}

/**
 * The receipt form posts one group of fields per order line, named
 * `accepted:<itemId>` and so on. Lines where nothing was entered are dropped
 * rather than recorded as a zero receipt, so a part delivery does not leave
 * empty rows against every other line on the order.
 */
function parseReceiptLines(form: FormData): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("accepted:")) continue;
    const itemId = key.slice("accepted:".length);
    const accepted = Math.max(0, Math.trunc(Number(value) || 0));
    const rejected = Math.max(0, Math.trunc(Number(form.get(`rejected:${itemId}`)) || 0));
    if (accepted === 0 && rejected === 0) continue;

    const expiryRaw = String(form.get(`expiry:${itemId}`) ?? "").trim();
    const expiry = expiryRaw ? new Date(expiryRaw) : null;

    lines.push({
      purchaseOrderItemId: itemId,
      accepted,
      rejected,
      rejectionReason: String(form.get(`reason:${itemId}`) ?? "").trim(),
      batchNumber: String(form.get(`batch:${itemId}`) ?? "").trim(),
      expiryDate: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
    });
  }
  return lines;
}

/** RECEIVED once every line is complete, PARTIALLY_RECEIVED while any is not. */
async function advancePurchaseOrderStatus(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
): Promise<void> {
  const items = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    select: { quantity: true, quantityReceived: true },
  });
  const anyReceived = items.some((item) => item.quantityReceived > 0);
  const allComplete = items.every((item) => item.quantityReceived >= item.quantity);

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      status: allComplete ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : undefined,
      completedAt: allComplete ? new Date() : null,
    },
  });
}

/** Close a sourcing round once everything it asked for has arrived. */
async function advanceSourcingFromOrder(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
): Promise<void> {
  const items = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId, sourcingRequestItemId: { not: null } },
    select: { sourcingRequestItem: { select: { sourcingRequestId: true } } },
  });
  const requestIds = [
    ...new Set(items.map((i) => i.sourcingRequestItem?.sourcingRequestId).filter(Boolean)),
  ] as string[];

  for (const requestId of requestIds) {
    const lines = await tx.sourcingRequestItem.findMany({
      where: { sourcingRequestId: requestId },
      select: { quantity: true, quantityReceived: true },
    });
    const complete = lines.every((line) => line.quantityReceived >= line.quantity);
    const partial = lines.some((line) => line.quantityReceived > 0);
    await tx.sourcingRequest.update({
      where: { id: requestId },
      data: { status: complete ? "FULFILLED" : partial ? "PARTIALLY_RECEIVED" : "ORDERED" },
    });
  }
}

// ---------------------------------------------------------------------------
// Supplier invoices and payments
// ---------------------------------------------------------------------------

/**
 * Record a supplier invoice and match it against the order and the delivery.
 *
 * The match runs on the way in, so a discrepancy is on the screen the moment
 * the invoice is keyed rather than being discovered when somebody queries the
 * payment weeks later. Duplicates are refused by a partial unique index on
 * (supplier, their invoice number) — the error message says which record to
 * open instead.
 */
export async function recordSupplierInvoice(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("payables");
    const supplierId = text(form, "supplierId");
    const purchaseOrderId = text(form, "purchaseOrderId") || null;
    const amount = money(form, "amount");
    if (!supplierId) return { ok: false, error: "Choose a supplier." };
    if (amount <= 0) return { ok: false, error: "An invoice must be for more than nothing." };

    const invoiceId = await medicalDb.$transaction(async (tx) => {
      const reference = await nextReference(tx, "SUPPLIER_INVOICE");
      const rate = toPesewas(text(form, "exchangeRate")) || 100;
      const amountGhs = Math.round((amount * rate) / 100);

      const invoice = await tx.supplierInvoice.create({
        data: {
          reference,
          supplierId,
          purchaseOrderId,
          supplierReference: text(form, "supplierReference"),
          status: "AWAITING_PAYMENT",
          issuedAt: date(form, "issuedAt") ?? new Date(),
          dueAt: date(form, "dueAt"),
          currency: text(form, "currency") || "GHS",
          exchangeRate: toDecimalString(rate),
          amount: toDecimalString(amount),
          amountGhs: toDecimalString(amountGhs),
          notes: text(form, "notes"),
          attachment: text(form, "attachment"),
        },
      });

      // Lines are drawn from the purchase order and what was accepted against
      // it, so the three-way comparison has something to compare.
      if (purchaseOrderId) {
        const orderItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId },
          select: {
            id: true,
            description: true,
            supplierSku: true,
            quantity: true,
            quantityReceived: true,
            unitCost: true,
          },
          orderBy: { id: "asc" },
        });

        for (const [index, item] of orderItems.entries()) {
          const invoiced = Math.max(
            0,
            Math.trunc(Number(form.get(`invoiced:${item.id}`) ?? item.quantityReceived)),
          );
          const unitPrice = toPesewas(String(form.get(`price:${item.id}`) ?? "")) || toPesewas(item.unitCost);
          const tax = toPesewas(String(form.get(`tax:${item.id}`) ?? ""));

          await tx.supplierInvoiceItem.create({
            data: {
              supplierInvoiceId: invoice.id,
              purchaseOrderItemId: item.id,
              description: item.description,
              supplierSku: item.supplierSku,
              quantityInvoiced: invoiced,
              unitPrice: toDecimalString(unitPrice),
              taxAmount: toDecimalString(tax),
              lineTotal: toDecimalString(lineAmount(invoiced, unitPrice) + tax),
              quantityOrdered: item.quantity,
              quantityAccepted: item.quantityReceived,
              unitCostOrdered: item.unitCost,
              position: index,
            },
          });
        }
      }

      await refreshInvoiceMatch(tx, invoice.id);

      await postTransaction(tx, {
        kind: "PURCHASE",
        direction: "DEBIT",
        amount: amountGhs,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: invoice.id,
        description: `Supplier invoice ${reference}`,
        recordedById: staff.staffId,
      });

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "SupplierInvoice",
        entityId: invoice.id,
        summary: `Recorded ${reference}`,
      });

      return invoice.id;
    });

    revalidatePath("/medicals/admin/payables");
    return { ok: true, id: invoiceId };
  } catch (error) {
    return failed(error, "The invoice could not be recorded.");
  }
}

/** Re-run the match and store what it found on the invoice. */
async function refreshInvoiceMatch(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  const match = matchInvoice(
    invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantityOrdered: item.quantityOrdered,
      quantityAccepted: item.quantityAccepted,
      quantityInvoiced: item.quantityInvoiced,
      unitCostOrdered: toPesewas(item.unitCostOrdered),
      unitPriceInvoiced: toPesewas(item.unitPrice),
      taxInvoiced: toPesewas(item.taxAmount),
      taxExpected: 0,
    })),
  );

  for (const line of match.lines) {
    await tx.supplierInvoiceItem.update({
      where: { id: line.id },
      data: { discrepancy: line.kind, discrepancyNote: line.note },
    });
  }

  await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: { discrepancyKind: match.kind },
  });
}

/** Accept the differences on an invoice, deliberately and with a name on it. */
export async function matchSupplierInvoice(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("payables", ["MANAGER", "FINANCE"]);
    const id = text(form, "invoiceId");
    const note = text(form, "note");

    await medicalDb.$transaction(async (tx) => {
      await refreshInvoiceMatch(tx, id);
      await tx.supplierInvoice.update({
        where: { id },
        data: { isMatched: true, matchedById: staff.staffId, matchedAt: new Date() },
      });
      await tx.supplierInvoiceItem.updateMany({
        where: { supplierInvoiceId: id, discrepancy: { not: "NONE" } },
        data: { isResolved: true, resolvedById: staff.staffId, resolutionNote: note },
      });
      await recordAudit(tx, staff, {
        action: "APPROVE",
        entity: "SupplierInvoice",
        entityId: id,
        summary: note ? `Accepted differences: ${note}` : "Accepted the invoice as billed",
      });
    });

    revalidatePath(`/medicals/admin/payables/${id}`);
    return { ok: true };
  } catch (error) {
    return failed(error, "The invoice could not be matched.");
  }
}

/**
 * Pay a supplier, in whole or in part.
 *
 * Partial payments are ordinary here — a hospital's own payment cycle means a
 * supplier is settled in two or three parts — so the invoice's status follows
 * what has actually gone out rather than being set by whoever recorded it.
 */
export async function recordSupplierPayment(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("payables", ["MANAGER", "FINANCE"]);
    const invoiceId = text(form, "invoiceId");
    const amount = money(form, "amount");
    if (amount <= 0) return { ok: false, error: "Enter an amount." };

    await medicalDb.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: { items: true },
      });

      const match = matchInvoice(
        invoice.items.map((item) => ({
          id: item.id,
          description: item.description,
          purchaseOrderItemId: item.purchaseOrderItemId,
          quantityOrdered: item.quantityOrdered,
          quantityAccepted: item.quantityAccepted,
          quantityInvoiced: item.quantityInvoiced,
          unitCostOrdered: toPesewas(item.unitCostOrdered),
          unitPriceInvoiced: toPesewas(item.unitPrice),
          taxInvoiced: toPesewas(item.taxAmount),
          taxExpected: 0,
        })),
      );

      // The gate: an invoice that does not match what was ordered and received
      // cannot be paid until somebody has looked at the difference and said so.
      if (!match.isClean && !invoice.isMatched) {
        throw new Error(
          "This invoice does not match the order and the delivery. Review the differences and accept them before paying.",
        );
      }

      const rate = toPesewas(invoice.exchangeRate) || 100;
      const amountGhs = Math.round((amount * rate) / 100);
      const reference = await nextReference(tx, "SUPPLIER_PAYMENT");

      await tx.supplierPayment.create({
        data: {
          reference,
          supplierId: invoice.supplierId,
          supplierInvoiceId: invoiceId,
          paidAt: date(form, "paidAt") ?? new Date(),
          method: text(form, "method") || "BANK",
          currency: invoice.currency,
          exchangeRate: toDecimalString(rate),
          amount: toDecimalString(amount),
          amountGhs: toDecimalString(amountGhs),
          note: text(form, "note"),
          recordedById: staff.staffId,
        },
      });

      const paid = toPesewas(invoice.amountPaid) + amount;
      await tx.supplierInvoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: toDecimalString(paid),
          status: settlementStatus(toPesewas(invoice.amount), paid),
        },
      });

      await postTransaction(tx, {
        kind: "SUPPLIER_PAYMENT",
        direction: "DEBIT",
        amount: amountGhs,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: invoiceId,
        description: `Paid ${reference} against ${invoice.reference}`,
        recordedById: staff.staffId,
      });

      await recordAudit(tx, staff, {
        action: "PAY",
        entity: "SupplierInvoice",
        entityId: invoiceId,
        summary: `Paid ${reference}`,
        changes: { amount: amount / 100 },
      });
    });

    revalidatePath(`/medicals/admin/payables/${invoiceId}`);
    revalidatePath("/medicals/admin/payables");
    return { ok: true };
  } catch (error) {
    return failed(error, "The payment could not be recorded.");
  }
}
