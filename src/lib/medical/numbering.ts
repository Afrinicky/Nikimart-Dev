import "server-only";
import type { Prisma } from ".prisma/medical-client";

/**
 * Document references: QT-2026-0147, PO-2026-0031, TD-2026-0004.
 *
 * Allocated from a counter row inside the same transaction that creates the
 * document. Deriving the next number from `max(reference)` races: two
 * quotations drafted in the same second both read the same maximum and both
 * become QT-2026-0148, and the one that loses the unique index is a document
 * somebody has already started writing.
 *
 * The counter is per series per year, so January resets to 0001 and the year
 * in the reference is the year it was issued.
 */

export type Series =
  | "QUOTATION"
  | "PROFORMA"
  | "REQUEST"
  | "ORDER"
  | "PAYMENT"
  | "REFUND"
  | "PO"
  | "GRN"
  | "SUPPLIER_INVOICE"
  | "SUPPLIER_PAYMENT"
  | "SUPPLIER_QUOTE"
  | "EXPENSE"
  | "PAYOUT"
  | "TRANSACTION"
  | "TENDER"
  | "TENDER_SUBMISSION"
  | "CUSTOMER_PO"
  | "SOURCING";

const PREFIX: Record<Series, string> = {
  QUOTATION: "QT",
  PROFORMA: "PI",
  REQUEST: "QR",
  ORDER: "SO",
  PAYMENT: "PY",
  REFUND: "RF",
  PO: "PO",
  GRN: "GRN",
  SUPPLIER_INVOICE: "SI",
  SUPPLIER_PAYMENT: "SP",
  SUPPLIER_QUOTE: "SQ",
  EXPENSE: "EX",
  PAYOUT: "PO-R",
  TRANSACTION: "TX",
  TENDER: "TD",
  TENDER_SUBMISSION: "TS",
  CUSTOMER_PO: "CPO",
  SOURCING: "SR",
};

/**
 * The next reference in a series.
 *
 * **Must** be called with a transaction client. Allocating a number outside
 * the transaction that writes the document means a crash between the two
 * leaves a gap, and a gap in a document series is a question an auditor asks.
 */
export async function nextReference(
  tx: Prisma.TransactionClient,
  series: Series,
  when: Date = new Date(),
): Promise<string> {
  const year = when.getFullYear();

  // Upsert-and-increment in one statement. `update` alone would fail on the
  // first document of a year; a read-then-write would race exactly as
  // max(reference) does.
  const row = await tx.documentCounter.upsert({
    where: { series_year: { series, year } },
    create: { series, year, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });

  return formatReference(series, year, row.value);
}

export function formatReference(series: Series, year: number, value: number): string {
  return `${PREFIX[series]}-${year}-${String(value).padStart(4, "0")}`;
}

/**
 * The next version of a document that already has a reference.
 *
 * A revision keeps the reference and takes the next version, so a customer
 * holding "QT-2026-0147 v2" and a salesperson looking at v3 can tell at a
 * glance that they are not looking at the same document.
 */
export function formatVersioned(reference: string, version: number): string {
  return version <= 1 ? reference : `${reference} v${version}`;
}
