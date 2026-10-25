// Relative with the extension — this module is reached from a *.test.ts.
// See src/lib/payment-routing.ts for the reasoning.
import { lineAmount, sum, type Pesewas } from "../money.ts";

/**
 * The three-way match: ordered, accepted, invoiced.
 *
 * Three numbers that should agree and routinely do not, and the gap between
 * them is where money leaves quietly. Billed for 100 when 94 came off the
 * lorry. A unit price 3% above the purchase order because "the rate moved".
 * A delivery charge nobody agreed. None of these are fraud and all of them are
 * paid, every month, by businesses that match invoices by eye.
 *
 * This module does not decide whether to pay. It states, per line, what
 * differs and by how much, so that a person can approve a difference
 * deliberately rather than miss it. A discrepancy that somebody has looked at
 * and accepted is fine; the failure is the one nobody saw.
 *
 * Pure, and tested. The arithmetic that decides whether an invoice is paid is
 * exactly the arithmetic that should not live inside a form handler.
 */

export type DiscrepancyKind = "NONE" | "QUANTITY" | "PRICE" | "TAX" | "MULTIPLE" | "UNMATCHED";

export interface MatchInput {
  id: string;
  description: string;
  /** Null when the invoice line matches nothing on any purchase order. */
  purchaseOrderItemId: string | null;
  quantityOrdered: number;
  /** What the store actually accepted. Rejected and damaged are not here. */
  quantityAccepted: number;
  quantityInvoiced: number;
  unitCostOrdered: Pesewas;
  unitPriceInvoiced: Pesewas;
  taxInvoiced: Pesewas;
  /** Tax we expected, from the order. Zero where none was agreed. */
  taxExpected: Pesewas;
}

export interface LineMatch {
  id: string;
  description: string;
  kind: DiscrepancyKind;
  /** Invoiced minus accepted. Positive means billed for more than arrived. */
  quantityVariance: number;
  /** Per-unit, invoiced minus ordered. Positive means billed above the order. */
  priceVariance: Pesewas;
  taxVariance: Pesewas;
  /**
   * What the difference is worth. Positive means the invoice asks for more
   * than the order and the delivery justify — the figure to argue about.
   */
  valueVariance: Pesewas;
  /** What we think the line should come to. */
  expectedTotal: Pesewas;
  invoicedTotal: Pesewas;
  note: string;
}

export interface InvoiceMatch {
  lines: LineMatch[];
  kind: DiscrepancyKind;
  /** Every line's variance, added up. The number finance cares about. */
  totalVariance: Pesewas;
  expectedTotal: Pesewas;
  invoicedTotal: Pesewas;
  /** True when nothing differs anywhere and the invoice can be paid as billed. */
  isClean: boolean;
  /** One line a person can read without opening the table. */
  summary: string;
}

/**
 * Tolerance, in pesewas, below which a value difference is not worth raising.
 *
 * One pesewa, so rounding on a converted foreign invoice does not flag every
 * line — and nothing larger, because "small" differences are exactly what a
 * supplier who is testing you starts with.
 */
const TOLERANCE: Pesewas = 1;

export function matchLine(input: MatchInput): LineMatch {
  // An invoice line that points at no order line cannot be matched at all.
  // Not a quantity problem and not a price problem: nobody ordered this.
  if (!input.purchaseOrderItemId) {
    const invoicedTotal =
      lineAmount(input.quantityInvoiced, input.unitPriceInvoiced) + input.taxInvoiced;
    return {
      id: input.id,
      description: input.description,
      kind: "UNMATCHED",
      quantityVariance: input.quantityInvoiced,
      priceVariance: input.unitPriceInvoiced,
      taxVariance: input.taxInvoiced,
      valueVariance: invoicedTotal,
      expectedTotal: 0,
      invoicedTotal,
      note: "Not on any purchase order line.",
    };
  }

  const quantityVariance = input.quantityInvoiced - input.quantityAccepted;
  const priceVariance = input.unitPriceInvoiced - input.unitCostOrdered;
  const taxVariance = input.taxInvoiced - input.taxExpected;

  // What we accept paying: what we accepted, at the price we agreed.
  const expectedTotal =
    lineAmount(input.quantityAccepted, input.unitCostOrdered) + input.taxExpected;
  const invoicedTotal =
    lineAmount(input.quantityInvoiced, input.unitPriceInvoiced) + input.taxInvoiced;
  const valueVariance = invoicedTotal - expectedTotal;

  const flags: DiscrepancyKind[] = [];
  if (quantityVariance !== 0) flags.push("QUANTITY");
  if (priceVariance !== 0) flags.push("PRICE");
  if (taxVariance !== 0) flags.push("TAX");

  const kind: DiscrepancyKind =
    flags.length === 0
      ? Math.abs(valueVariance) <= TOLERANCE
        ? "NONE"
        : "PRICE"
      : flags.length === 1
        ? flags[0]
        : "MULTIPLE";

  return {
    id: input.id,
    description: input.description,
    kind,
    quantityVariance,
    priceVariance,
    taxVariance,
    valueVariance,
    expectedTotal,
    invoicedTotal,
    note: describeLine(input, { quantityVariance, priceVariance, taxVariance }),
  };
}

export function matchInvoice(inputs: readonly MatchInput[]): InvoiceMatch {
  const lines = inputs.map(matchLine);
  const kinds = new Set(lines.map((line) => line.kind).filter((kind) => kind !== "NONE"));

  const kind: DiscrepancyKind =
    kinds.size === 0
      ? "NONE"
      : kinds.size === 1
        ? ([...kinds][0] as DiscrepancyKind)
        : kinds.has("UNMATCHED") && kinds.size === 1
          ? "UNMATCHED"
          : "MULTIPLE";

  const totalVariance = sum(lines.map((line) => line.valueVariance));
  const expectedTotal = sum(lines.map((line) => line.expectedTotal));
  const invoicedTotal = sum(lines.map((line) => line.invoicedTotal));
  const isClean = kind === "NONE" && Math.abs(totalVariance) <= TOLERANCE;

  return {
    lines,
    kind,
    totalVariance,
    expectedTotal,
    invoicedTotal,
    isClean,
    summary: describeInvoice(lines, kind, totalVariance),
  };
}

function describeLine(
  input: MatchInput,
  variance: { quantityVariance: number; priceVariance: Pesewas; taxVariance: Pesewas },
): string {
  const parts: string[] = [];

  if (variance.quantityVariance > 0) {
    parts.push(
      `Billed for ${input.quantityInvoiced} but ${input.quantityAccepted} accepted` +
        (input.quantityAccepted < input.quantityOrdered
          ? ` of ${input.quantityOrdered} ordered`
          : ""),
    );
  } else if (variance.quantityVariance < 0) {
    parts.push(`Billed for ${input.quantityInvoiced}, ${input.quantityAccepted} accepted`);
  }

  if (variance.priceVariance > 0) parts.push("Unit price above the purchase order");
  else if (variance.priceVariance < 0) parts.push("Unit price below the purchase order");

  if (variance.taxVariance > 0) parts.push("Tax above what was agreed");
  else if (variance.taxVariance < 0) parts.push("Tax below what was agreed");

  return parts.join(". ");
}

function describeInvoice(
  lines: readonly LineMatch[],
  kind: DiscrepancyKind,
  totalVariance: Pesewas,
): string {
  if (kind === "NONE") return "Matches the order and the delivery.";

  const affected = lines.filter((line) => line.kind !== "NONE").length;
  const noun = affected === 1 ? "line" : "lines";
  const direction =
    totalVariance > 0 ? "more than" : totalVariance < 0 ? "less than" : "the same as";

  if (kind === "UNMATCHED") {
    return `${affected} ${noun} not on any purchase order. Billed ${direction} expected.`;
  }
  return `${affected} ${noun} differ. The invoice asks ${direction} the order and delivery support.`;
}

/**
 * Whether an invoice may be settled.
 *
 * A clean invoice may. One with differences may only once somebody has marked
 * it matched, which is a deliberate act with a name against it — not a
 * checkbox that defaults on.
 */
export function canSettle(match: InvoiceMatch, isMatched: boolean): boolean {
  return match.isClean || isMatched;
}

/**
 * What is still owed on an invoice.
 *
 * Partial payments are ordinary here: a hospital's own payment cycle means we
 * pay a supplier in two or three parts. The balance is the invoice less what
 * has gone out against it, floored at zero — an overpayment is a credit note,
 * not a negative payable, and showing it as one makes every total wrong.
 */
export function outstandingOn(amount: Pesewas, paid: Pesewas): Pesewas {
  const balance = amount - paid;
  return balance > 0 ? balance : 0;
}

/** PAID when nothing is left, PARTIALLY_PAID when something has gone out. */
export function settlementStatus(
  amount: Pesewas,
  paid: Pesewas,
): "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "PAID" {
  if (paid <= 0) return "AWAITING_PAYMENT";
  if (paid >= amount) return "PAID";
  return "PARTIALLY_PAID";
}
