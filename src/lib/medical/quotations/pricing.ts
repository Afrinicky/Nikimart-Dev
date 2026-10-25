import {
  applyRate,
  floorAtZero,
  lineAmount,
  sum,
  type BasisPoints,
  type Pesewas,
} from "../money.ts";

/**
 * What a quotation adds up to.
 *
 * The arithmetic is here, pure and tested, and not in the action that writes
 * it — because this is the figure a customer is held to and the one a finance
 * office releases money against, and a sum that only exists inside a server
 * action is a sum nobody can check.
 *
 * The order the parts apply in is the whole of it, and it is the order a
 * reader of the document would assume:
 *
 *   1. each line: quantity × unit price, less that line's own discount
 *   2. subtotal: the lines added up
 *   3. document discount: on the subtotal, after line discounts
 *   4. charges: delivery, handling, other — added, never discounted
 *   5. tax: on everything above it, and zero unless somebody has set a rate
 *   6. outright total
 *   7. instalment uplift, where a plan applies
 *   8. payable
 *
 * Steps 3 and 5 are where this kind of code usually goes wrong. A document
 * discount applied before the line discounts double-counts; a tax applied
 * before the discount charges the customer for money they were not asked for.
 *
 * Rates are basis points throughout, money is integer pesewas, and nothing is
 * rounded until a figure has to be stored — so a 5% discount on three lines
 * cannot be a pesewa out from the same discount on their sum.
 */

export type DiscountKind = "NONE" | "PERCENT" | "AMOUNT";

export interface LineInput {
  quantity: number;
  unitPrice: Pesewas;
  discountKind: DiscountKind;
  /** Basis points for PERCENT, pesewas for AMOUNT, ignored for NONE. */
  discountValue: number;
}

export interface LineAmounts {
  /** quantity × unit price, before any discount. */
  gross: Pesewas;
  discount: Pesewas;
  /** What prints on the line. Never negative. */
  total: Pesewas;
}

/**
 * One line.
 *
 * A discount larger than the line does not create credit: it takes the line to
 * zero and the discount is reported as what was actually given, not as what was
 * typed. Otherwise a mis-typed amount would turn one line into a refund against
 * the rest of the document.
 */
export function priceLine(line: LineInput): LineAmounts {
  const quantity = Math.max(0, Math.trunc(line.quantity));
  const gross = lineAmount(quantity, line.unitPrice);

  const asked =
    line.discountKind === "PERCENT"
      ? applyRate(gross, line.discountValue as BasisPoints)
      : line.discountKind === "AMOUNT"
        ? Math.max(0, Math.trunc(line.discountValue))
        : 0;

  const discount = Math.min(gross, asked);
  return { gross, discount, total: floorAtZero(gross - discount) };
}

export interface DocumentInput {
  lines: readonly LineInput[];
  discountKind: DiscountKind;
  /** Basis points for PERCENT, pesewas for AMOUNT. */
  discountValue: number;
  deliveryCharge: Pesewas;
  handlingCharge: Pesewas;
  otherCharge: Pesewas;
  /**
   * Basis points. Zero unless an administrator has set a rate — no rate is
   * assumed anywhere, because Ghana's VAT, NHIL and GETFund cannot be expressed
   * as one and guessing would put a wrong figure on a customer's document.
   */
  taxRate: BasisPoints;
  /** An instalment plan's uplift, in basis points. Zero for outright. */
  planUpliftRate: BasisPoints;
  /** Basis points of the payable taken as a deposit. */
  depositRate: BasisPoints;
}

export interface DocumentAmounts {
  lines: LineAmounts[];
  /** The lines added up, after their own discounts. */
  subtotal: Pesewas;
  /** The document-level discount, as actually applied. */
  discountAmount: Pesewas;
  charges: Pesewas;
  /** What tax is charged on: subtotal − discount + charges. */
  taxableAmount: Pesewas;
  taxAmount: Pesewas;
  /** The total if it is paid outright. */
  totalOutright: Pesewas;
  planUpliftAmount: Pesewas;
  /** totalOutright + uplift. The figure printed large at the foot. */
  totalPayable: Pesewas;
  depositAmount: Pesewas;
  /** What remains after the deposit. */
  balanceAfterDeposit: Pesewas;
}

export function priceDocument(input: DocumentInput): DocumentAmounts {
  const lines = input.lines.map(priceLine);
  const subtotal = sum(lines.map((line) => line.total));

  const askedDiscount =
    input.discountKind === "PERCENT"
      ? applyRate(subtotal, input.discountValue as BasisPoints)
      : input.discountKind === "AMOUNT"
        ? Math.max(0, Math.trunc(input.discountValue))
        : 0;
  const discountAmount = Math.min(subtotal, askedDiscount);

  const charges =
    Math.max(0, input.deliveryCharge) +
    Math.max(0, input.handlingCharge) +
    Math.max(0, input.otherCharge);

  // Charges are not discounted: a delivery charge is what the courier costs,
  // and a discount on the goods is not a discount on getting them there.
  const taxableAmount = floorAtZero(subtotal - discountAmount) + charges;
  const taxAmount = applyRate(taxableAmount, input.taxRate);

  const totalOutright = taxableAmount + taxAmount;
  const planUpliftAmount = applyRate(totalOutright, input.planUpliftRate);
  const totalPayable = totalOutright + planUpliftAmount;
  const depositAmount = Math.min(totalPayable, applyRate(totalPayable, input.depositRate));

  return {
    lines,
    subtotal,
    discountAmount,
    charges,
    taxableAmount,
    taxAmount,
    totalOutright,
    planUpliftAmount,
    totalPayable,
    depositAmount,
    balanceAfterDeposit: floorAtZero(totalPayable - depositAmount),
  };
}

/**
 * The margin on a priced document.
 *
 * Private, and the reason the cost is frozen onto each line at issue: a margin
 * recomputed next month against today's cost would tell you what the sale would
 * be worth if you made it again, which is not what anybody is asking.
 *
 * Returns null when no line carries a cost, rather than reporting a margin of
 * 100% — which is what a zero cost would otherwise produce, and the most
 * confidently wrong figure a report can show.
 */
export function marginOf(
  lines: readonly { quantity: number; unitCost: Pesewas; total: Pesewas }[],
): { revenue: Pesewas; cost: Pesewas; profit: Pesewas; rate: BasisPoints } | null {
  const cost = sum(
    lines.map((line) => lineAmount(Math.max(0, Math.trunc(line.quantity)), line.unitCost)),
  );
  if (cost <= 0) return null;

  const revenue = sum(lines.map((line) => line.total));
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    // Margin on revenue, not mark-up on cost. The two are different numbers
    // and quoting one as the other overstates what the business makes.
    rate: revenue > 0 ? Math.round((profit * 10_000) / revenue) : 0,
  };
}
