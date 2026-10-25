"use server";

import { revalidatePath } from "next/cache";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { nextReference } from "@/lib/medical/numbering";
import { dispatchStock, releaseReservation, InsufficientStockError } from "@/lib/medical/inventory/stock";
import { postTransaction } from "@/lib/medical/finance/ledger";
import { toDecimalString, toPesewas } from "@/lib/medical/money";
import {
  amountsOnDelivery,
  balanceAfter,
  paymentStatusFor,
} from "@/lib/medical/sales/settlement";

/**
 * Goods out, delivered, paid for — the three events at the end of a sale.
 *
 * They are three actions rather than one because they are three events, days
 * or weeks apart, done by different people, and each is wrong to assume from
 * either of the others. A courier collecting a consignment is not a delivery.
 * A delivery is not a payment. Collapsing them is what produces a system that
 * cannot answer "has it gone out and have they paid" without a telephone call.
 *
 * What each one writes:
 *
 *   dispatch   stock out of batches (FEFO), the batches recorded against the
 *              line, cost of goods accumulated on the order. No revenue.
 *   deliver    the delivery date, and the only point at which SALE_REVENUE and
 *              COGS are posted. Once per order, guarded.
 *   payment    a Payment row, the order's collected figure, and CASH_RECEIPT.
 *              Never revenue — that was earned on delivery, not today.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => toPesewas(text(f, k));

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof InsufficientStockError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/**
 * Dispatch what is going out today, line by line.
 *
 * Part dispatches are ordinary: a hospital's order of six items arrives in
 * three consignments, and a form that insists on all or nothing would have
 * somebody record the whole order as shipped on the day the first box left.
 *
 * Batches are consumed first-expiry-first-out by `dispatchStock` and the
 * allocation is written onto the line, which is what makes a recall
 * answerable: "who received batch B-2026-01" is a query, not an afternoon with
 * the delivery book.
 */
export async function dispatchSalesOrder(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-orders", ["MANAGER", "SALES", "STORES"]);
    const id = text(form, "salesOrderId");

    const result = await medicalDb.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: { items: { orderBy: { position: "asc" } } },
      });
      if (order.fulfilmentStatus === "CANCELLED") {
        throw new Error("This order was cancelled.");
      }
      if (order.deliveredAt) {
        throw new Error("This order has already been delivered.");
      }

      const going = order.items
        .map((item) => {
          const outstanding = item.quantity - item.quantityDispatched;
          const asked = Math.trunc(Number(form.get(`send:${item.id}`) ?? 0));
          return { item, qty: Math.max(0, Math.min(outstanding, Number.isFinite(asked) ? asked : 0)) };
        })
        .filter((entry) => entry.qty > 0);

      if (going.length === 0) {
        throw new Error("Enter a quantity against at least one line.");
      }

      let costOfGoods = 0;

      for (const entry of going) {
        if (!entry.item.productId) {
          // A line with no catalogue product holds no stock, so there is
          // nothing to draw down — it is marked out and costs nothing, which
          // is the truth rather than a guess at a cost.
          await tx.salesOrderItem.update({
            where: { id: entry.item.id },
            data: { quantityDispatched: { increment: entry.qty } },
          });
          continue;
        }

        const dispatched = await dispatchStock(
          tx,
          entry.item.productId,
          entry.qty,
          {
            sourceType: "SALES_ORDER",
            sourceId: order.id,
            staffId: staff.staffId,
            reason: `Dispatched against ${order.reference}`,
          },
          // Consume this order's own reservation rather than taking a second
          // bite: the units were already set aside for it on acceptance.
          { fromReservation: entry.item.quantityReserved > 0 },
        );

        costOfGoods += dispatched.costOfGoods;

        // Appended, not replaced: a second consignment of the same line came
        // out of different batches and both have to stay traceable.
        const previous = parseAllocation(entry.item.batchAllocation);
        await tx.salesOrderItem.update({
          where: { id: entry.item.id },
          data: {
            quantityDispatched: { increment: entry.qty },
            quantityReserved: {
              decrement: Math.min(entry.item.quantityReserved, entry.qty),
            },
            batchAllocation: JSON.stringify([
              ...previous,
              ...dispatched.allocations.map((a) => ({
                batchId: a.batchId,
                quantity: a.quantity,
                unitCost: toDecimalString(a.unitCost),
                at: new Date().toISOString(),
              })),
            ]),
          },
        });
      }

      // Read back rather than computed from what we just sent: another
      // consignment may have gone out between the read at the top and here.
      const after = await tx.salesOrderItem.findMany({ where: { salesOrderId: order.id } });
      const everything = after.every((item) => item.quantityDispatched >= item.quantity);

      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          fulfilmentStatus: everything ? "DISPATCHED" : "PARTIALLY_DISPATCHED",
          dispatchedAt: order.dispatchedAt ?? new Date(),
          costOfGoods: toDecimalString(toPesewas(order.costOfGoods) + costOfGoods),
          trackingNote: text(form, "trackingNote") || order.trackingNote,
          deliverySnapshot: text(form, "deliverTo") || order.deliverySnapshot,
        },
      });

      await recordAudit(tx, staff, {
        action: "DISPATCH",
        entity: "SalesOrder",
        entityId: order.id,
        summary: `Dispatched ${going.reduce((n, e) => n + e.qty, 0)} units on ${order.reference}`,
        changes: { lines: going.length, costOfGoods },
      });

      return { reference: order.reference, everything };
    });

    revalidatePath(`/medicals/admin/customer-orders/${id}`);
    revalidatePath("/medicals/admin/customer-orders");
    return {
      ok: true,
      message: result.everything
        ? `Everything on ${result.reference} is out. Nothing is recognised as revenue until it is delivered.`
        : `Consignment recorded. ${result.reference} is part dispatched.`,
    };
  } catch (error) {
    return failed(error, "The dispatch could not be recorded.");
  }
}

/**
 * Mark an order delivered, and recognise what it earned.
 *
 * The one place revenue is posted. It is posted for what actually left — the
 * dispatched quantities at the order's own prices — because billing for the
 * ordered quantity when nine of the ten went out is how a receivable is
 * created that nobody will ever pay.
 *
 * Guarded against a second posting: the delivery date is checked and the
 * ledger is checked, because the first catches an honest double-click and the
 * second catches a row written by some other route.
 */
export async function markSalesOrderDelivered(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-orders", ["MANAGER", "SALES", "STORES"]);
    const id = text(form, "salesOrderId");

    const result = await medicalDb.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (order.deliveredAt) throw new Error("This order is already recorded as delivered.");
      if (order.fulfilmentStatus === "CANCELLED") throw new Error("This order was cancelled.");

      const dispatched = order.items.reduce((n, item) => n + item.quantityDispatched, 0);
      if (dispatched === 0) {
        throw new Error("Nothing has been dispatched yet, so there is nothing to deliver.");
      }

      const already = await tx.financialTransaction.count({
        where: { kind: "SALE_REVENUE", sourceType: "SALES_ORDER", sourceId: order.id },
      });
      if (already > 0) throw new Error("Revenue has already been posted for this order.");

      // The arithmetic lives in `settlement.ts` and is tested there: what is
      // earned is the goods that actually left plus the charges the customer
      // agreed to, and what is owed is that less the discount.
      const amounts = amountsOnDelivery(
        order.items.map((item) => ({
          quantityDispatched: item.quantityDispatched,
          unitPrice: toPesewas(item.unitPrice),
        })),
        {
          deliveryCharge: toPesewas(order.deliveryCharge),
          handlingCharge: toPesewas(order.handlingCharge),
          otherCharge: toPesewas(order.otherCharge),
          taxAmount: toPesewas(order.taxAmount),
          discountAmount: toPesewas(order.discountAmount),
        },
      );
      const { goods, discount, revenue, payable } = amounts;
      const costOfGoods = toPesewas(order.costOfGoods);

      const everything = order.items.every((item) => item.quantityDispatched >= item.quantity);

      // Reservations against lines that were never sent are released: holding
      // stock for an order that has been closed out is how a shelf reads full
      // and sells nothing.
      for (const item of order.items) {
        if (item.productId && item.quantityReserved > 0) {
          await releaseReservation(tx, item.productId, item.quantityReserved, {
            sourceType: "SALES_ORDER",
            sourceId: order.id,
            staffId: staff.staffId,
            reason: `Released on delivery of ${order.reference}`,
          });
          await tx.salesOrderItem.update({
            where: { id: item.id },
            data: { quantityReserved: 0 },
          });
        }
      }

      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          fulfilmentStatus: everything ? "DELIVERED" : "COMPLETED",
          deliveredAt: new Date(),
          completedAt: everything ? null : new Date(),
          // What is owed is what was delivered, plus the charges, less the
          // discount. Written here because this is the first moment the figure
          // is known.
          subtotal: toDecimalString(goods),
          totalOutright: toDecimalString(payable),
          totalPayable: toDecimalString(payable),
          balanceDue: toDecimalString(balanceAfter(payable, toPesewas(order.amountPaid))),
          trackingNote: text(form, "note") || order.trackingNote,
        },
      });

      await postTransaction(tx, {
        kind: "SALE_REVENUE",
        direction: "CREDIT",
        amount: revenue,
        sourceType: "SALES_ORDER",
        sourceId: order.id,
        recordedById: staff.staffId,
        description: `Delivered ${order.reference}`,
      });

      // A discount is a reduction in what we earned, recorded as its own entry
      // rather than netted off the revenue: a report that cannot see what was
      // given away cannot tell a good month from a generous one.
      if (discount > 0) {
        await postTransaction(tx, {
          kind: "DISCOUNT",
          direction: "DEBIT",
          amount: discount,
          sourceType: "SALES_ORDER",
          sourceId: order.id,
          recordedById: staff.staffId,
          description: `Discount on ${order.reference}`,
        });
      }

      if (costOfGoods > 0) {
        await postTransaction(tx, {
          kind: "COGS",
          direction: "DEBIT",
          amount: costOfGoods,
          sourceType: "SALES_ORDER",
          sourceId: order.id,
          recordedById: staff.staffId,
          description: `Cost of goods on ${order.reference}`,
        });
      }

      await recordAudit(tx, staff, {
        action: "DELIVER",
        entity: "SalesOrder",
        entityId: order.id,
        summary: `Delivered ${order.reference}`,
        changes: { ...amounts, costOfGoods, everything },
      });

      return { reference: order.reference, payable };
    });

    revalidatePath(`/medicals/admin/customer-orders/${id}`);
    revalidatePath("/medicals/admin/customer-orders");
    return {
      ok: true,
      message: `${result.reference} delivered. Revenue recognised; nothing has been collected yet.`,
    };
  } catch (error) {
    return failed(error, "The delivery could not be recorded.");
  }
}

/**
 * Record money received against an order.
 *
 * Part payments are ordinary — an institution's payment cycle settles an
 * invoice in two or three parts — so the status follows what has actually
 * arrived rather than being set by whoever keys it in.
 *
 * Posts CASH_RECEIPT and never SALE_REVENUE. The two are different facts and
 * the ledger keeps them apart: revenue was earned on delivery, and this is the
 * money turning up afterwards.
 */
export async function recordCustomerPayment(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("customer-orders", ["MANAGER", "FINANCE", "SALES"]);
    const id = text(form, "salesOrderId");
    const amount = money(form, "amount");
    if (amount <= 0) return { ok: false, error: "Enter the amount received." };

    const result = await medicalDb.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUniqueOrThrow({ where: { id } });

      const payable = toPesewas(order.totalPayable);
      const paid = toPesewas(order.amountPaid);
      const outstanding = payable - paid;
      if (outstanding <= 0) throw new Error("Nothing is outstanding on this order.");
      if (amount > outstanding) {
        throw new Error(
          "That is more than is outstanding. Record the balance, or raise a credit note for the difference.",
        );
      }

      const reference = await nextReference(tx, "PAYMENT");
      const paidAtRaw = text(form, "paidAt");
      const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();

      await tx.payment.create({
        data: {
          reference,
          salesOrderId: order.id,
          method: text(form, "method") || "BANK",
          // Recorded by hand means it has already happened; a gateway payment
          // is the one that starts as pending, and it does not come through
          // this action.
          status: "SUCCESSFUL",
          currency: order.currency,
          amount: toDecimalString(amount),
          paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
          recordedById: staff.staffId,
          note: text(form, "note"),
        },
      });

      const collected = paid + amount;
      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          amountPaid: toDecimalString(collected),
          balanceDue: toDecimalString(balanceAfter(payable, collected)),
          // Derived, never chosen: an order must not read PAID while money is
          // outstanding because somebody picked the wrong option.
          paymentStatus: paymentStatusFor(payable, collected),
        },
      });

      await postTransaction(tx, {
        kind: "CASH_RECEIPT",
        direction: "CREDIT",
        amount,
        sourceType: "PAYMENT",
        sourceId: order.id,
        recordedById: staff.staffId,
        description: `${reference} against ${order.reference}`,
      });

      await recordAudit(tx, staff, {
        action: "COLLECT",
        entity: "SalesOrder",
        entityId: order.id,
        summary: `Received ${reference} against ${order.reference}`,
        changes: { amount, collected, outstanding: payable - collected },
      });

      return {
        reference,
        settled: paymentStatusFor(payable, collected) === "PAID",
        remaining: balanceAfter(payable, collected),
      };
    });

    revalidatePath(`/medicals/admin/customer-orders/${id}`);
    revalidatePath("/medicals/admin/customer-orders");
    return {
      ok: true,
      message: result.settled
        ? `${result.reference} recorded. The order is settled in full.`
        : `${result.reference} recorded. A balance remains.`,
    };
  } catch (error) {
    return failed(error, "The payment could not be recorded.");
  }
}

/** Batch allocations already written against a line, or none if unreadable. */
function parseAllocation(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
