"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";
import { reserveStock, InsufficientStockError } from "@/lib/medical/inventory/stock";
import { lineAmount, sum, toDecimalString, toPesewas } from "@/lib/medical/money";

/**
 * The purchase order a hospital sends *us*.
 *
 * A different document from the one we send a supplier, and the distinction is
 * the point: this one authorises us to supply, and that one commits us to buy.
 * Sharing a table would make every query ambiguous and every total wrong.
 *
 * Received is not accepted. A purchase order arrives, somebody checks it
 * against the quotation it answers — the lines, the quantities, above all the
 * prices — and only then does it become an order we have agreed to fulfil.
 * Skipping that step is how a hospital's typing error becomes our loss.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => toPesewas(text(f, k));
const date = (f: FormData, k: string) => {
  const raw = text(f, k);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof InsufficientStockError) return { ok: false, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { ok: false, error: "That purchase order has already been recorded." };
  }
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/**
 * Record a purchase order a customer has sent in.
 *
 * Lines are copied from the quotation it accepts, so the comparison that
 * follows is against what we actually offered rather than against whatever
 * somebody retypes.
 */
export async function recordCustomerPurchaseOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-purchase-orders");
    const quotationId = text(form, "quotationId") || null;
    const organisationId = text(form, "organisationId") || null;
    const customerReference = text(form, "customerReference");

    if (!quotationId && !organisationId) {
      return { ok: false, error: "Link it to a quotation or choose the institution." };
    }

    const id = await medicalDb.$transaction(async (tx) => {
      const quotation = quotationId
        ? await tx.quotation.findUniqueOrThrow({
            where: { id: quotationId },
            include: { items: true },
          })
        : null;

      const reference = await nextReference(tx, "CUSTOMER_PO");
      const order = await tx.customerPurchaseOrder.create({
        data: {
          reference,
          customerReference,
          organisationId: organisationId ?? quotation?.organisationId ?? null,
          customerId: quotation?.customerId ?? null,
          quotationId,
          tenderId: text(form, "tenderId") || null,
          status: "RECEIVED",
          receivedAt: date(form, "receivedAt") ?? new Date(),
          receivedVia: text(form, "receivedVia") || "EMAIL",
          expectedDeliveryAt: date(form, "expectedDeliveryAt"),
          currency: quotation?.currency ?? "GHS",
          totalValue: toDecimalString(money(form, "totalValue")),
          paymentTerms: text(form, "paymentTerms") || quotation?.paymentTerms || "",
          deliveryTo: text(form, "deliveryTo"),
          notes: text(form, "notes"),
          documentUrl: text(form, "documentUrl"),
        },
      });

      if (quotation) {
        for (const [index, item] of quotation.items.entries()) {
          await tx.customerPurchaseOrderItem.create({
            data: {
              purchaseOrderId: order.id,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              // Nothing is accepted on arrival. Acceptance is the next step
              // and it is per line, because a hospital routinely orders three
              // of the five lines quoted.
              acceptedQuantity: 0,
              isAccepted: false,
              position: index * 10,
            },
          });
        }
      }

      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "CustomerPurchaseOrder",
        entityId: order.id,
        summary: `Recorded ${reference}${customerReference ? ` (their ${customerReference})` : ""}`,
      });

      return order.id;
    });

    revalidatePath("/medicals/admin/customer-purchase-orders");
    return {
      ok: true,
      id,
      message: "Recorded. Check it against the quotation before accepting it.",
    };
  } catch (error) {
    return failed(error, "The purchase order could not be recorded.");
  }
}

/**
 * Accept a customer purchase order and turn it into a sales order.
 *
 * Where a sale actually begins. Everything before this — a quotation, an
 * award, a received purchase order — is agreement; this is the commitment, and
 * it is the first point at which stock is reserved.
 *
 * Reserving rather than deducting: the goods are still on the shelf, but they
 * are no longer available to anybody else. Deducting here would say the goods
 * had left when they have not, and the delivery note is what says that.
 *
 * An order that cannot be covered from stock is still accepted. It is a real
 * commitment and the shortfall is a procurement problem, not a reason to
 * refuse the customer — `shortfallFor` then opens a sourcing round for it.
 */
export async function acceptCustomerPurchaseOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-purchase-orders", ["MANAGER", "SALES"]);
    const id = text(form, "purchaseOrderId");

    const result = await medicalDb.$transaction(async (tx) => {
      const po = await tx.customerPurchaseOrder.findUniqueOrThrow({
        where: { id },
        include: {
          items: true,
          quotation: { select: { id: true, reference: true, status: true } },
        },
      });
      if (po.salesOrderId) throw new Error("This purchase order has already been accepted.");
      if (po.status === "REJECTED" || po.status === "CANCELLED") {
        throw new Error("This purchase order was not accepted.");
      }

      // Per line, per quantity. A document-level yes cannot express "three of
      // the five lines, and 40 of the 100 on one of them".
      const accepted = po.items
        .map((item) => {
          const qty = Math.max(
            0,
            Math.trunc(Number(form.get(`accept:${item.id}`) ?? item.quantity)),
          );
          return { item, qty };
        })
        .filter((entry) => entry.qty > 0);

      if (accepted.length === 0) {
        throw new Error("Accept at least one line, or reject the purchase order.");
      }

      const reference = await nextReference(tx, "ORDER");
      const subtotal = sum(
        accepted.map((entry) => lineAmount(entry.qty, toPesewas(entry.item.unitPrice))),
      );

      const salesOrder = await tx.salesOrder.create({
        data: {
          reference,
          channel: "QUOTATION",
          customerId: po.customerId,
          organisationId: po.organisationId,
          quotationId: po.quotationId,
          fulfilmentStatus: "CONFIRMED",
          // Unpaid, explicitly. An accepted purchase order is not a payment,
          // and nothing downstream may treat it as one.
          paymentStatus: "UNPAID",
          confirmedAt: new Date(),
          currency: po.currency,
          subtotal: toDecimalString(subtotal),
          totalOutright: toDecimalString(subtotal),
          totalPayable: toDecimalString(subtotal),
          balanceDue: toDecimalString(subtotal),
          // The customer's own purchase order number, carried onto the sales
          // order. Every document they issue afterwards quotes it and nothing
          // else, so it has to be findable from the order.
          customerNote: [po.customerReference ? `Their PO ${po.customerReference}` : "", po.notes]
            .filter(Boolean)
            .join(" · "),
          internalNote: po.paymentTerms ? `Payment terms: ${po.paymentTerms}` : "",
        },
      });

      let reserved = 0;
      let shortLines = 0;

      for (const [index, entry] of accepted.entries()) {
        const unitPrice = toPesewas(entry.item.unitPrice);
        const orderItem = await tx.salesOrderItem.create({
          data: {
            salesOrderId: salesOrder.id,
            productId: entry.item.productId,
            description: entry.item.description,
            quantity: entry.qty,
            unit: entry.item.unit,
            unitPrice: toDecimalString(unitPrice),
            lineTotal: toDecimalString(lineAmount(entry.qty, unitPrice)),
            position: index * 10,
          },
        });

        await tx.customerPurchaseOrderItem.update({
          where: { id: entry.item.id },
          data: { acceptedQuantity: entry.qty, isAccepted: true },
        });

        if (entry.item.productId) {
          // Reserve what the shelf can cover. A shortfall is not a failure
          // here — it is the next piece of work, and it is picked up by the
          // sourcing round the order page offers.
          const product = await tx.medicalProduct.findUniqueOrThrow({
            where: { id: entry.item.productId },
            select: { stockOnHand: true, stockReserved: true },
          });
          const free = Math.max(0, product.stockOnHand - product.stockReserved);
          const toReserve = Math.min(free, entry.qty);

          if (toReserve > 0) {
            await reserveStock(tx, entry.item.productId, toReserve, {
              sourceType: "SALES_ORDER",
              sourceId: salesOrder.id,
              staffId: staff.staffId,
              reason: `Reserved for ${reference}`,
            });
            await tx.salesOrderItem.update({
              where: { id: orderItem.id },
              data: { quantityReserved: toReserve },
            });
            reserved += toReserve;
          }
          if (toReserve < entry.qty) shortLines += 1;
        } else {
          shortLines += 1;
        }
      }

      const partial = accepted.length < po.items.length;
      await tx.customerPurchaseOrder.update({
        where: { id },
        data: {
          status: partial ? "PARTIALLY_ACCEPTED" : "ACCEPTED",
          salesOrderId: salesOrder.id,
          reviewedById: staff.staffId,
          reviewedAt: new Date(),
        },
      });

      if (po.quotation) {
        await tx.quotation.update({
          where: { id: po.quotation.id },
          data: { status: "CONVERTED" },
        });
        await tx.quotationEvent.create({
          data: {
            quotationId: po.quotation.id,
            kind: "CONVERTED",
            summary: `Converted to ${reference} against purchase order ${po.customerReference || po.reference}`,
            actorKind: "STAFF",
            actorId: staff.staffId,
            actorName: staff.name,
          },
        });
      }

      await recordAudit(tx, staff, {
        action: "ACCEPT",
        entity: "CustomerPurchaseOrder",
        entityId: id,
        summary: `Accepted ${po.reference} and raised ${reference}`,
        changes: { linesAccepted: accepted.length, unitsReserved: reserved },
      });

      return { salesOrderId: salesOrder.id, reference, shortLines };
    });

    revalidatePath("/medicals/admin/customer-purchase-orders");
    revalidatePath("/medicals/admin/customer-orders");
    return {
      ok: true,
      id: result.salesOrderId,
      message:
        result.shortLines > 0
          ? `${result.reference} raised. ${result.shortLines} line${result.shortLines === 1 ? "" : "s"} cannot be filled from stock — open a sourcing round.`
          : `${result.reference} raised and stock reserved. Nothing has been paid or dispatched.`,
    };
  } catch (error) {
    return failed(error, "The purchase order could not be accepted.");
  }
}

/** Reject a purchase order, with a reason the customer will be told. */
export async function rejectCustomerPurchaseOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-purchase-orders", ["MANAGER", "SALES"]);
    const id = text(form, "purchaseOrderId");
    const reason = text(form, "reason");
    if (!reason) return { ok: false, error: "Give a reason." };

    await medicalDb.$transaction(async (tx) => {
      const po = await tx.customerPurchaseOrder.findUniqueOrThrow({ where: { id } });
      if (po.salesOrderId) throw new Error("This one has already been accepted.");

      await tx.customerPurchaseOrder.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          reviewedById: staff.staffId,
          reviewedAt: new Date(),
        },
      });
      await recordAudit(tx, staff, {
        action: "REJECT",
        entity: "CustomerPurchaseOrder",
        entityId: id,
        summary: `Rejected ${po.reference}: ${reason}`,
      });
    });

    revalidatePath("/medicals/admin/customer-purchase-orders");
    return { ok: true };
  } catch (error) {
    return failed(error, "The purchase order could not be rejected.");
  }
}
