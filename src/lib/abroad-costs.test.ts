import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ABROAD_TERMS, type AbroadTerms } from "./abroad.ts";
import {
  amountDueNow,
  balanceAfter,
  emptyBreakdown,
  priceAbroadLine,
  sumBreakdowns,
} from "./abroad-costs.ts";
import { internationalFreight, resolveArrivalRate, type ArrivalRate } from "./arrival-points.ts";

/**
 * The landed bill is the thing a buyer reads before handing over money for
 * something in another country, so the properties worth pinning down are the
 * ones that would quietly overcharge or undercharge them: what a
 * freight-included price does and does not add, what duty is assessed on, and
 * exactly which rows the goods-only plan defers.
 */

const TERMS: AbroadTerms = {
  ...EMPTY_ABROAD_TERMS,
  sourceLocation: "Guangzhou, China",
  originCountry: "CN",
  freightMode: "sea",
  arrivalPointId: "ap-tema",
  freightBasis: "itemised",
  supplierFreight: 50,
  originTaxRate: 10,
  ghanaTaxRate: 20,
};

const RATE: ArrivalRate = {
  originCountry: "CN",
  mode: "sea",
  ratePerCbm: 1000,
  ratePerKg: 0,
  minCharge: 0,
  transitDays: 35,
};

/** One unit, 0.1 CBM, GH₵1,000, into a point charging 20% duty. */
function price(terms: AbroadTerms, overrides: Partial<Parameters<typeof priceAbroadLine>[0]> = {}) {
  return priceAbroadLine({
    unitPrice: 1000,
    quantity: 1,
    cbm: 0.1,
    weightKg: 2,
    terms,
    rate: RATE,
    dutyPercent: 20,
    clearingFee: 30,
    defaultGhanaTaxRate: 21.9,
    domesticFreight: 60,
    ...overrides,
  });
}

test("every leg is priced and the total is their sum", () => {
  const bill = price(TERMS);
  assert.equal(bill.goods, 1000);
  assert.equal(bill.originTax, 100); // 10% of the goods
  assert.equal(bill.supplierFreight, 50); // leg 1, as typed
  assert.equal(bill.internationalFreight, 100); // leg 2: 1000 ₵/CBM × 0.1
  // Duty is assessed on the CIF value — goods plus the freight that got them
  // here — not on the goods alone: 20% of (1000 + 50 + 100).
  assert.equal(bill.importDuty, 230);
  assert.equal(bill.clearingFee, 30);
  // Ghana VAT is assessed on CIF *plus* duty: 20% of (1150 + 230).
  assert.equal(bill.ghanaTax, 276);
  assert.equal(bill.domesticFreight, 60);
  assert.equal(
    bill.total,
    1000 + 100 + 50 + 100 + 230 + 30 + 276 + 60,
  );
});

test("a freight-included price is not billed for freight twice", () => {
  // The seller copied a delivered-to-Ghana quote, so legs 1 and 2 are already
  // inside their price. Charging them again is the single most expensive
  // mistake this engine could make.
  const bill = price({ ...TERMS, freightIncluded: true });
  assert.equal(bill.supplierFreight, 0);
  assert.equal(bill.internationalFreight, 0);
  assert.equal(bill.freightIncluded, true);
  // Duty is then assessed on the goods alone, because the freight the buyer
  // paid is inside a price we cannot decompose.
  assert.equal(bill.importDuty, 200);
  // The domestic leg is still charged: the goods still have to reach them.
  assert.equal(bill.domesticFreight, 60);
});

test("duty-included skips both the duty and the clearing charge", () => {
  const bill = price({ ...TERMS, dutyIncluded: true });
  assert.equal(bill.importDuty, 0);
  assert.equal(bill.clearingFee, 0);
  // Ghana VAT still applies — it is not the forwarder's to have prepaid.
  assert.ok(bill.ghanaTax > 0);
});

test("a listing with no rate of its own falls back to the platform Ghana tax", () => {
  const bill = price({ ...TERMS, ghanaTaxRate: -1 });
  // 21.9% of (CIF 1150 + duty 230) = 302.22
  assert.equal(bill.ghanaTax, 302.22);
});

test("the goods-only plan defers exactly what is assessed at the border", () => {
  const bill = price(TERMS);
  // Legs 2 and 3, duty, clearing and Ghana tax: the charges whose price can
  // still move between order and arrival.
  assert.equal(bill.deferrable, 100 + 230 + 30 + 276 + 60);
  // The goods, the tax where they were bought and leg 1 are already spent.
  assert.equal(bill.goodsOnlyNow, 1000 + 100 + 50);
  assert.equal(bill.goodsOnlyNow + bill.deferrable, bill.total);

  assert.equal(amountDueNow(bill, "full"), bill.total);
  assert.equal(balanceAfter(bill, "full"), 0);
  assert.equal(amountDueNow(bill, "goods_only"), bill.goodsOnlyNow);
  assert.equal(balanceAfter(bill, "goods_only"), bill.deferrable);
});

test("an all-in forwarder quote is charged once and nothing is added to it", () => {
  // Most Ghana-bound consolidators quote one number covering carriage, duty
  // and clearing from their warehouse abroad to the arrival point. Splitting
  // that into invented components and then assessing duty and VAT on them
  // would charge the buyer for the same customs bill twice.
  const bill = price({ ...TERMS, freightBasis: "all_in", intlFreight: 420 });
  assert.equal(bill.internationalFreight, 420);
  assert.equal(bill.importDuty, 0);
  assert.equal(bill.clearingFee, 0);
  assert.equal(bill.ghanaTax, 0);
  assert.equal(bill.allInFreight, true);
  // Leg 1 and the tax at source are outside the quote and still charged, and
  // so is leg 3 — the forwarder's figure stops at the arrival point.
  assert.equal(bill.supplierFreight, 50);
  assert.equal(bill.originTax, 100);
  assert.equal(bill.domesticFreight, 60);
  assert.equal(bill.total, 1000 + 100 + 50 + 420 + 60);
});

test("an all-in quote ignores the rate table rather than competing with it", () => {
  // The seller has a real invoice; a rate-table guess would contradict it.
  const bill = price({ ...TERMS, freightBasis: "all_in", intlFreight: 420 }, { rate: RATE });
  assert.equal(bill.internationalFreight, 420);
  // And with no rate configured at all it is still quotable, because the
  // number never came from the table.
  const noRate = price({ ...TERMS, freightBasis: "all_in", intlFreight: 420 }, { rate: null });
  assert.equal(noRate.internationalFreight, 420);
  assert.equal(noRate.unpricedRoute, false);
});

test("an all-in quote still defers with the goods-only plan", () => {
  const bill = price({ ...TERMS, freightBasis: "all_in", intlFreight: 420 });
  // The combined charge and leg 3: everything at or past the border.
  assert.equal(bill.deferrable, 480);
  assert.equal(bill.goodsOnlyNow, 1150);
});

test("a freight-included price beats the all-in basis", () => {
  // The seller said the buyer has already paid for freight inside the price.
  // Charging the combined quote on top would double-bill them.
  const bill = price({ ...TERMS, freightBasis: "all_in", intlFreight: 420, freightIncluded: true });
  assert.equal(bill.internationalFreight, 0);
  assert.equal(bill.supplierFreight, 0);
});

test("a seller's own leg-2 figure overrides the rate table", () => {
  const bill = price({ ...TERMS, intlFreight: 250 });
  assert.equal(bill.internationalFreight, 250);
  assert.equal(bill.unpricedRoute, false);
});

test("an all-in listing with no figure is unpriced, not free", () => {
  // Choosing the all-in basis and then leaving the box empty would otherwise
  // ship the consignment with zero freight, at the platform's expense.
  const bill = price({ ...TERMS, freightBasis: "all_in", intlFreight: 0 });
  assert.equal(bill.internationalFreight, 0);
  assert.equal(bill.unpricedRoute, true);
});

test("an unpriced route is flagged rather than quoted free", () => {
  // Quoting zero would sell a consignment the platform then has to freight at
  // its own cost. Saying so lets checkout refuse the order instead.
  const bill = price(TERMS, { rate: null });
  assert.equal(bill.internationalFreight, 0);
  assert.equal(bill.unpricedRoute, true);
  // Not flagged when nobody expects to be charged for that leg.
  assert.equal(price({ ...TERMS, freightIncluded: true }, { rate: null }).unpricedRoute, false);
  assert.equal(price({ ...TERMS, intlFreight: 200 }, { rate: null }).unpricedRoute, false);
});

test("quantity multiplies the goods and both seller-set freight legs", () => {
  const bill = price(TERMS, { quantity: 3 });
  assert.equal(bill.goods, 3000);
  assert.equal(bill.supplierFreight, 150);
  assert.equal(bill.internationalFreight, 300); // 1000 ₵/CBM × 0.1 × 3
});

test("a domestic line contributes goods and delivery and nothing else", () => {
  const bill = emptyBreakdown(250, 15);
  assert.equal(bill.total, 265);
  assert.equal(bill.deferrable, 0);
  // Nothing is deferrable on a local order, so the goods-only plan collects
  // the whole thing rather than quietly postponing the delivery fee.
  assert.equal(bill.goodsOnlyNow, 265);
});

test("a mixed cart sums line by line", () => {
  const imported = price(TERMS);
  const local = emptyBreakdown(200, 10);
  const cart = sumBreakdowns([imported, local]);
  assert.equal(cart.goods, 1200);
  assert.equal(cart.total, imported.total + local.total);
  assert.equal(cart.domesticFreight, 70);
  assert.equal(cart.deferrable, imported.deferrable);
  assert.equal(cart.freightIncluded, false);
});

test("leg 2 applies volume and weight together, floored by the minimum", () => {
  // Forwarders really do charge a CBM rate and volumetric weight on the same
  // consignment, so the two are added rather than treated as alternatives.
  const both: ArrivalRate = { ...RATE, ratePerKg: 5, minCharge: 0 };
  assert.equal(internationalFreight(both, 0.1, 2, 1), 110); // 100 + 10
  // The minimum is a floor under the sum, not a replacement for it.
  assert.equal(internationalFreight({ ...both, minCharge: 400 }, 0.1, 2, 1), 400);
  assert.equal(internationalFreight(null, 0.1, 2, 1), 0);
});

test("the rate search widens one axis at a time", () => {
  const point = {
    rates: [
      { ...RATE, originCountry: "CN", mode: "air", ratePerCbm: 5000 },
      { ...RATE, originCountry: "*", mode: "sea", ratePerCbm: 900 },
      { ...RATE, originCountry: "*", mode: "*", ratePerCbm: 1500 },
    ],
  };
  // Exact match first.
  assert.equal(resolveArrivalRate(point, "CN", "air")?.ratePerCbm, 5000);
  // Then any-origin for that mode — the catch-all sea rate, not the catch-all
  // of catch-alls.
  assert.equal(resolveArrivalRate(point, "CN", "sea")?.ratePerCbm, 900);
  // Then the total catch-all.
  assert.equal(resolveArrivalRate(point, "US", "road")?.ratePerCbm, 1500);
  // Null when the point prices nothing that could carry it — a real answer,
  // not zero.
  assert.equal(resolveArrivalRate({ rates: [] }, "CN", "sea"), null);
});
