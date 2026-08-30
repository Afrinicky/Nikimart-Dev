/**
 * The bill for a shipped-from-abroad line.
 *
 * A domestic order has two numbers: goods and shipping. This one has eight,
 * because the item is bought in one country, taxed there, carried to a
 * forwarder, flown or shipped to Ghana, taxed and dutied again on landing, and
 * only then moved to the buyer's pickup point. Collapsing that into "price +
 * delivery" is how a buyer ends up paying a number nobody explained, so every
 * leg is priced separately and shown separately.
 *
 * The two rules that shape everything here:
 *
 *   - `freightIncluded` means the seller's price already contains legs 1 and 2.
 *     Sellers who copy an Alibaba listing that quotes delivered-to-Accra prices
 *     are in this case, and charging them again would double-bill the buyer.
 *   - The buyer may pay the whole bill now, or pay for the goods now and settle
 *     the freight when it lands. What is deferrable is exactly the part whose
 *     price can still move: leg 2, the duty and taxes assessed on landing, and
 *     leg 3. Goods, origin tax and leg 1 are already spent by then.
 *
 * Pure. The seller's form, the checkout estimate and the order action all run
 * this same function, so what a buyer is quoted is what they are charged.
 */

import type { AbroadTerms } from "@/lib/abroad";
// Relative with an explicit extension, not aliased: this module is unit-tested
// by `node --test` with no bundler, so a real (non-type-only) import has to
// resolve without tsconfig path mapping.
import { internationalFreight, type ArrivalRate } from "./arrival-points.ts";

export type PaymentPlan = "full" | "goods_only";

export interface AbroadCostInput {
  /** The listed price of one unit, in GH₵. */
  unitPrice: number;
  quantity: number;
  /** Per-unit shipping volume, cubic metres. */
  cbm: number;
  /** Per-unit billable weight, kilograms. */
  weightKg: number;
  terms: AbroadTerms;
  /** The leg-2 rate resolved from the chosen arrival point, or null. */
  rate: ArrivalRate | null;
  /** Ghana import duty at that point, percent of the CIF value. */
  dutyPercent: number;
  /** Flat clearing / handling at that point, GH₵ per line. */
  clearingFee: number;
  /** Platform Ghana VAT + levies (percent), used when the listing defers. */
  defaultGhanaTaxRate: number;
  /** Leg 3, already priced by the CBM route engine for this line. */
  domesticFreight: number;
}

export interface AbroadCostBreakdown {
  /** The goods themselves: unit price × quantity. */
  goods: number;
  /** Sales tax or VAT charged in the country of purchase. */
  originTax: number;
  /** Leg 1: supplier → freight forwarder abroad. */
  supplierFreight: number;
  /** Leg 2: forwarder → the Ghana arrival point. */
  internationalFreight: number;
  /** Ghana import duty, assessed on the CIF value. */
  importDuty: number;
  /** Clearing and handling at the arrival point. */
  clearingFee: number;
  /** Ghana VAT and levies, assessed on CIF + duty. */
  ghanaTax: number;
  /** Leg 3: the Ghana arrival point → the buyer's pickup point. */
  domesticFreight: number;
  /** Everything, which is what "pay in full" costs. */
  total: number;
  /** The part that may be settled on arrival: legs 2 and 3, duty and Ghana tax. */
  deferrable: number;
  /** What is due today under the goods-only plan. */
  goodsOnlyNow: number;
  /** True when the seller's price already covers legs 1 and 2. */
  freightIncluded: boolean;
  /** True when the chosen route has no rate configured yet. */
  unpricedRoute: boolean;
}

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/**
 * Price one line, whole.
 *
 * Duty and Ghana VAT follow customs practice rather than intuition: duty is
 * assessed on the CIF value (goods plus the freight that got them here), and
 * VAT on that value *plus* the duty. Applying either to the goods alone
 * under-quotes the buyer, and under-quoting is worse than over-quoting when the
 * shortfall surfaces at a customs desk with the item already in the country.
 */
export function priceAbroadLine(input: AbroadCostInput): AbroadCostBreakdown {
  const qty = Math.max(1, Math.round(input.quantity));
  const { terms } = input;

  const goods = round(input.unitPrice * qty);
  const originTax = round((goods * Math.max(0, terms.originTaxRate)) / 100);

  // Legs 1 and 2. When the seller says the price already includes them, they
  // are zero here — not because they weren't paid, but because the buyer has
  // already paid them inside the price.
  const supplierFreight = terms.freightIncluded ? 0 : round(terms.supplierFreight * qty);
  const quotedLeg2 = terms.intlFreight > 0
    ? round(terms.intlFreight * qty)
    : internationalFreight(input.rate, input.cbm, input.weightKg, qty);
  const leg2 = terms.freightIncluded ? 0 : quotedLeg2;

  // A route the admin has not priced, on a listing that expects to be charged
  // for it. Worth saying out loud rather than quoting zero freight.
  const unpricedRoute = !terms.freightIncluded && terms.intlFreight <= 0 && input.rate === null;

  // CIF: what customs values the consignment at. Uses the seller's own leg-2
  // figure when the price includes it, because the goods still crossed a border
  // and duty is owed on the freight either way.
  const cif = goods + (terms.freightIncluded ? 0 : supplierFreight + leg2);

  const importDuty = terms.dutyIncluded ? 0 : round((cif * Math.max(0, input.dutyPercent)) / 100);
  const clearingFee = terms.dutyIncluded ? 0 : round(input.clearingFee);

  const ghanaRate = terms.ghanaTaxRate >= 0 ? terms.ghanaTaxRate : Math.max(0, input.defaultGhanaTaxRate);
  const ghanaTax = round(((cif + importDuty) * ghanaRate) / 100);

  const domesticFreight = round(input.domesticFreight);

  const total = round(
    goods + originTax + supplierFreight + leg2 + importDuty + clearingFee + ghanaTax + domesticFreight,
  );

  // What the buyer may leave until the item lands. Everything assessed at or
  // after the border: its price can still move, and under the goods-only plan
  // that movement is the buyer's.
  const deferrable = round(leg2 + importDuty + clearingFee + ghanaTax + domesticFreight);

  return {
    goods,
    originTax,
    supplierFreight,
    internationalFreight: leg2,
    importDuty,
    clearingFee,
    ghanaTax,
    domesticFreight,
    total,
    deferrable,
    goodsOnlyNow: round(total - deferrable),
    freightIncluded: terms.freightIncluded,
    unpricedRoute,
  };
}

/** An all-zero breakdown, for a line with no abroad terms. */
export function emptyBreakdown(goods = 0, domesticFreight = 0): AbroadCostBreakdown {
  return {
    goods: round(goods),
    originTax: 0,
    supplierFreight: 0,
    internationalFreight: 0,
    importDuty: 0,
    clearingFee: 0,
    ghanaTax: 0,
    domesticFreight: round(domesticFreight),
    total: round(goods + domesticFreight),
    deferrable: 0,
    goodsOnlyNow: round(goods + domesticFreight),
    freightIncluded: false,
    unpricedRoute: false,
  };
}

/** Add up per-line breakdowns into one order-level bill. */
export function sumBreakdowns(lines: AbroadCostBreakdown[]): AbroadCostBreakdown {
  return lines.reduce<AbroadCostBreakdown>(
    (acc, l) => ({
      goods: round(acc.goods + l.goods),
      originTax: round(acc.originTax + l.originTax),
      supplierFreight: round(acc.supplierFreight + l.supplierFreight),
      internationalFreight: round(acc.internationalFreight + l.internationalFreight),
      importDuty: round(acc.importDuty + l.importDuty),
      clearingFee: round(acc.clearingFee + l.clearingFee),
      ghanaTax: round(acc.ghanaTax + l.ghanaTax),
      domesticFreight: round(acc.domesticFreight + l.domesticFreight),
      total: round(acc.total + l.total),
      deferrable: round(acc.deferrable + l.deferrable),
      goodsOnlyNow: round(acc.goodsOnlyNow + l.goodsOnlyNow),
      freightIncluded: acc.freightIncluded || l.freightIncluded,
      unpricedRoute: acc.unpricedRoute || l.unpricedRoute,
    }),
    emptyBreakdown(),
  );
}

/** What is charged today, given the plan the buyer chose. */
export function amountDueNow(bill: AbroadCostBreakdown, plan: PaymentPlan): number {
  return plan === "goods_only" ? bill.goodsOnlyNow : bill.total;
}

/** What is left to settle on arrival, given the plan. */
export function balanceAfter(bill: AbroadCostBreakdown, plan: PaymentPlan): number {
  return plan === "goods_only" ? bill.deferrable : 0;
}

/** The rows of a bill, in the order a buyer should read them. */
export const BILL_ROWS: {
  key: keyof AbroadCostBreakdown;
  label: string;
  hint: string;
  /** True when this row can be left until the goods land. */
  deferrable: boolean;
}[] = [
  { key: "goods", label: "Item price", hint: "What the seller charges for the goods.", deferrable: false },
  { key: "originTax", label: "Tax at source", hint: "Sales tax or VAT in the country of purchase.", deferrable: false },
  {
    key: "supplierFreight",
    label: "Freight leg 1 — supplier to forwarder",
    hint: "Moving the goods to the freight forwarder abroad.",
    deferrable: false,
  },
  {
    key: "internationalFreight",
    label: "Freight leg 2 — forwarder to Ghana",
    hint: "Air or sea carriage to the Ghana arrival point.",
    deferrable: true,
  },
  { key: "importDuty", label: "Import duty", hint: "Ghana customs duty on the landed value.", deferrable: true },
  { key: "clearingFee", label: "Clearing & handling", hint: "Charges at the arrival point.", deferrable: true },
  { key: "ghanaTax", label: "Ghana VAT & levies", hint: "Assessed on the landed value plus duty.", deferrable: true },
  {
    key: "domesticFreight",
    label: "Freight leg 3 — arrival point to your pickup",
    hint: "Moving it inside Ghana to the point you chose.",
    deferrable: true,
  },
];
