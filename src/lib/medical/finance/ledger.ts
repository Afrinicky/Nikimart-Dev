import "server-only";
import type { Prisma } from ".prisma/medical-client";
import { nextReference } from "@/lib/medical/numbering";
import { toDecimalString, type Pesewas } from "@/lib/medical/money";

/**
 * The financial ledger: every money event, once.
 *
 * Why it exists, stated plainly because it is the rule the whole finance side
 * depends on: without a single place that records what happened, "revenue"
 * gets counted when a quotation is accepted, again when the order is
 * confirmed, again when the invoice is raised and again when the money lands —
 * and every report disagrees with every other one. One row per event, with the
 * thing that caused it named, and every report becomes a sum over this table
 * rather than over whatever each screen happened to compute.
 *
 * The four things that are not the same thing, and are never merged here:
 *
 *   SALE_REVENUE   we have earned it          (an order was fulfilled)
 *   CASH_RECEIPT   we have been paid for it   (money arrived)
 *   PURCHASE       we owe for goods           (an invoice or a receipt)
 *   SUPPLIER_PAYMENT we have paid for them    (money left)
 *
 * An accepted quotation posts none of them. It is an agreement, not a sale,
 * not a payment and not a delivery.
 *
 * Append-only. A mistake is corrected by a reversing entry that points back at
 * what it reverses, never by an update or a delete, so the correction and the
 * thing it corrects both stay readable.
 */

export interface LedgerEntry {
  kind:
    | "SALE_REVENUE"
    | "CASH_RECEIPT"
    | "REFUND"
    | "COGS"
    | "PURCHASE"
    | "SUPPLIER_PAYMENT"
    | "EXPENSE"
    | "COMMISSION_ACCRUAL"
    | "COMMISSION_PAYOUT"
    | "STOCK_WRITE_OFF"
    | "DISCOUNT"
    | "ADJUSTMENT";
  /** From the business's point of view. Explicit so a reversal reads as one. */
  direction: "DEBIT" | "CREDIT";
  amount: Pesewas;
  sourceType: string;
  sourceId: string;
  description?: string;
  recordedById?: string;
  /** When it happened in the business, which is not when the row was written. */
  occurredAt?: Date;
}

/**
 * Post one entry. Always inside the caller's transaction, so a ledger row can
 * never exist for a change that was rolled back.
 */
export async function postTransaction(
  tx: Prisma.TransactionClient,
  entry: LedgerEntry,
): Promise<string> {
  const reference = await nextReference(tx, "TRANSACTION");
  const row = await tx.financialTransaction.create({
    data: {
      reference,
      kind: entry.kind,
      direction: entry.direction,
      amount: toDecimalString(entry.amount),
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      description: entry.description ?? "",
      recordedById: entry.recordedById ?? "",
      occurredAt: entry.occurredAt ?? new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Reverse an entry.
 *
 * A new row in the opposite direction, pointing back at the one it cancels.
 * Both stay. Deleting the original would leave a report that used to say one
 * thing and now says another with nothing to explain the difference, which is
 * the single worst thing a financial record can do.
 */
export async function reverseTransaction(
  tx: Prisma.TransactionClient,
  transactionId: string,
  reason: string,
  recordedById?: string,
): Promise<string> {
  const original = await tx.financialTransaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      id: true,
      kind: true,
      direction: true,
      amount: true,
      sourceType: true,
      sourceId: true,
      reference: true,
      reversedBy: { select: { id: true } },
    },
  });

  if (original.reversedBy) {
    throw new Error("That entry has already been reversed.");
  }

  const reference = await nextReference(tx, "TRANSACTION");
  const row = await tx.financialTransaction.create({
    data: {
      reference,
      kind: original.kind,
      direction: original.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amount: original.amount,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      description: `Reversal of ${original.reference}: ${reason}`,
      recordedById: recordedById ?? "",
      reversesId: original.id,
    },
    select: { id: true },
  });

  return row.id;
}
