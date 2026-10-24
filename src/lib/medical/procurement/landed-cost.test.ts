import assert from "node:assert/strict";
import test from "node:test";
import {
  apportionLandedCosts,
  compareOffers,
  convert,
  landedCostOf,
  weightedAverageCost,
  type Offer,
} from "./landed-cost.ts";
import { percentToBasisPoints, sum, toPesewas } from "../money.ts";

/** 1 USD = GH₵15.40, as basis points of GH₵ per unit of foreign currency. */
const USD = percentToBasisPoints(1540);
const GHS = percentToBasisPoints(100);

function offer(partial: Partial<Offer> & Pick<Offer, "id" | "lines">): Offer {
  return {
    supplierId: `sup-${partial.id}`,
    supplierName: `Supplier ${partial.id}`,
    currency: "GHS",
    exchangeRate: GHS,
    freight: 0,
    insurance: 0,
    otherSupplierCharges: 0,
    dutyRate: 0,
    clearingGhs: 0,
    otherGhs: 0,
    leadTimeDays: 7,
    costsConfirmed: true,
    ...partial,
  };
}

test("convert uses the rate recorded on the quote", () => {
  assert.equal(convert(toPesewas(100), USD), toPesewas(1540));
  assert.equal(convert(toPesewas(4.1), USD), toPesewas(63.14));
  assert.equal(convert(toPesewas(100), GHS), toPesewas(100), "a cedi quote converts to itself");
});

test("duty is charged on goods plus freight, not on goods alone", () => {
  const result = landedCostOf(
    offer({
      id: "a",
      currency: "USD",
      exchangeRate: USD,
      lines: [{ id: "l1", quantity: 100, unitPrice: toPesewas(10) }],
      freight: toPesewas(200),
      dutyRate: percentToBasisPoints(20),
    }),
  );

  assert.equal(result.goodsGhs, toPesewas(15_400), "100 × $10 at 15.40");
  assert.equal(result.freightGhs, toPesewas(3_080), "$200 at 15.40");
  assert.equal(result.customsValueGhs, toPesewas(18_480), "CIF, not goods alone");
  assert.equal(result.dutyGhs, toPesewas(3_696), "20% of CIF");
  assert.equal(result.totalGhs, toPesewas(22_176));
  // Charging duty on goods alone would have given 3,080 — a 616 understatement
  // on one order, which is the whole reason this is a function with a test.
  assert.notEqual(result.dutyGhs, toPesewas(3_080));
});

test("the cheapest unit price is not the cheapest supplier", () => {
  // The case the whole screen exists for. The dollar supplier looks far
  // cheaper per unit and lands dearer once freight, duty and clearing land.
  const abroad = offer({
    id: "abroad",
    currency: "USD",
    exchangeRate: USD,
    lines: [{ id: "x", quantity: 500, unitPrice: toPesewas(3.5) }],
    freight: toPesewas(900),
    insurance: toPesewas(120),
    dutyRate: percentToBasisPoints(20),
    clearingGhs: toPesewas(2_400),
    leadTimeDays: 45,
    costsConfirmed: false,
  });
  const local = offer({
    id: "local",
    lines: [{ id: "y", quantity: 500, unitPrice: toPesewas(62) }],
    leadTimeDays: 5,
  });

  // $3.50 at 15.40 is GH₵53.90 against GH₵62 — the import is genuinely
  // cheaper per unit, which is the only way this comparison proves anything.
  const abroadUnit = convert(toPesewas(3.5), USD);
  assert.equal(abroadUnit, toPesewas(53.9));
  assert.ok(abroadUnit < toPesewas(62), "by unit price the import wins");

  const comparison = compareOffers([abroad, local]);
  assert.equal(comparison.best?.offerId, "local", "by landed cost the local supplier wins");
  assert.equal(comparison.cheapestByUnitPrice?.offerId, "abroad");
  assert.ok(comparison.savingAgainstUnitPriceChoice > 0);
  assert.equal(
    comparison.savingAgainstUnitPriceChoice,
    (comparison.cheapestByUnitPrice?.totalGhs ?? 0) - (comparison.best?.totalGhs ?? 0),
  );
  assert.equal(comparison.hasEstimates, true, "the import is still carrying estimates");
});

test("no banner when the cheapest unit price is also the cheapest landed", () => {
  const a = offer({ id: "a", lines: [{ id: "1", quantity: 10, unitPrice: toPesewas(50) }] });
  const b = offer({ id: "b", lines: [{ id: "1", quantity: 10, unitPrice: toPesewas(70) }] });
  const comparison = compareOffers([a, b]);
  assert.equal(comparison.best?.offerId, "a");
  assert.equal(comparison.cheapestByUnitPrice, null, "nothing to warn about");
  assert.equal(comparison.savingAgainstUnitPriceChoice, 0);
});

test("ties break on lead time, then on confirmed costs", () => {
  const slow = offer({
    id: "slow",
    lines: [{ id: "1", quantity: 10, unitPrice: toPesewas(100) }],
    leadTimeDays: 30,
  });
  const fast = offer({
    id: "fast",
    lines: [{ id: "1", quantity: 10, unitPrice: toPesewas(100) }],
    leadTimeDays: 3,
  });
  assert.equal(compareOffers([slow, fast]).best?.offerId, "fast");

  const estimated = offer({
    id: "estimated",
    lines: [{ id: "1", quantity: 10, unitPrice: toPesewas(100) }],
    leadTimeDays: 3,
    costsConfirmed: false,
  });
  assert.equal(
    compareOffers([estimated, fast]).best?.offerId,
    "fast",
    "same money, same date — the confirmed one wins",
  );
});

test("comparing nothing is not an error", () => {
  const empty = compareOffers([]);
  assert.deepEqual(empty.ranked, []);
  assert.equal(empty.best, null);
  assert.equal(empty.hasEstimates, false);
});

test("per-unit landed cost is the total over the units", () => {
  const result = landedCostOf(
    offer({
      id: "a",
      lines: [
        { id: "1", quantity: 100, unitPrice: toPesewas(10) },
        { id: "2", quantity: 50, unitPrice: toPesewas(20) },
      ],
      clearingGhs: toPesewas(500),
    }),
  );
  assert.equal(result.totalUnits, 150);
  assert.equal(result.totalGhs, toPesewas(2_500));
  assert.equal(result.perUnitGhs, toPesewas(16.67), "2,500 over 150");
});

test("apportioned landed costs add back to exactly what was paid", () => {
  const lines = [
    { id: "gloves", quantity: 100, unitCost: toPesewas(58) },
    { id: "analyser", quantity: 1, unitCost: toPesewas(22_800) },
    { id: "swabs", quantity: 400, unitCost: toPesewas(0.23) },
  ];
  const charges = toPesewas(4_200);
  const shares = apportionLandedCosts(lines, charges);

  assert.equal(sum(shares.map((s) => s.lineCharges)), charges, "not a pesewa lost");
  assert.equal(shares.length, 3);

  // Apportioned by value, so the analyser carries most of the freight and the
  // swabs almost none. Apportioning by units would have done the opposite.
  const analyser = shares.find((s) => s.id === "analyser")!;
  const swabs = shares.find((s) => s.id === "swabs")!;
  assert.ok(analyser.lineCharges > swabs.lineCharges * 10);

  // The landed unit cost is above the invoice cost on every line.
  for (const [index, share] of shares.entries()) {
    assert.ok(share.landedUnitCost >= lines[index].unitCost, lines[index].id);
  }
});

test("apportionment holds across awkward numbers", () => {
  for (const charge of [1, 7, 99, 100, 123_457, 9_999_999]) {
    const lines = [
      { id: "a", quantity: 3, unitCost: toPesewas(19.99) },
      { id: "b", quantity: 7, unitCost: toPesewas(4.05) },
      { id: "c", quantity: 11, unitCost: toPesewas(123.45) },
    ];
    const shares = apportionLandedCosts(lines, charge);
    assert.equal(sum(shares.map((s) => s.lineCharges)), charge, `charge ${charge}`);
  }
});

test("zero charges leave the unit cost where it was", () => {
  const shares = apportionLandedCosts([{ id: "a", quantity: 10, unitCost: toPesewas(25) }], 0);
  assert.equal(shares[0].lineCharges, 0);
  assert.equal(shares[0].landedUnitCost, toPesewas(25));
});

test("weighted average cost does not let one delivery rewrite the stock", () => {
  // 80 held at GH₵280, 20 received at GH₵310. The average moves to 286, not 310.
  const next = weightedAverageCost(80, toPesewas(280), 20, toPesewas(310));
  assert.equal(next, toPesewas(286));
  assert.ok(next < toPesewas(310), "the 80 already held did not become dearer");
});

test("weighted average handles the empty-shelf and no-op cases", () => {
  assert.equal(
    weightedAverageCost(0, toPesewas(999), 10, toPesewas(50)),
    toPesewas(50),
    "nothing to average against, and the old cost is stock that no longer exists",
  );
  assert.equal(
    weightedAverageCost(10, toPesewas(50), 0, toPesewas(999)),
    toPesewas(50),
    "receiving nothing changes nothing",
  );
  assert.equal(weightedAverageCost(-5, toPesewas(50), 10, toPesewas(80)), toPesewas(80));
});
