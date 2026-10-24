import assert from "node:assert/strict";
import test from "node:test";
import {
  apportion,
  applyRate,
  basisPointsToDecimalString,
  basisPointsToPercent,
  floorAtZero,
  formatPesewas,
  formatRate,
  lineAmount,
  percentToBasisPoints,
  roundHalfAway,
  splitEvenly,
  sum,
  toBasisPoints,
  toCedis,
  toDecimalString,
  toPesewas,
} from "./money.ts";

/** What a Decimal column hands back: an object that stringifies exactly. */
function column(value: string) {
  return { toString: () => value };
}

test("toPesewas accepts every shape a price arrives in", () => {
  assert.equal(toPesewas(column("1250.75")), 125_075);
  assert.equal(toPesewas(1250.75), 125_075);
  assert.equal(toPesewas("1250.75"), 125_075);
  assert.equal(toPesewas("1,250.75"), 125_075, "a typed figure may carry a thousands separator");
  assert.equal(toPesewas(null), 0);
  assert.equal(toPesewas(undefined), 0);
  assert.equal(toPesewas(""), 0, "a blank form field is zero, not NaN");
  assert.equal(toPesewas("not a price"), 0);
});

test("a price survives a round trip through the database type", () => {
  for (const literal of ["0.01", "9.99", "1250.75", "84500.00", "99999999.99"]) {
    assert.equal(toDecimalString(toPesewas(column(literal))), literal, literal);
  }
});

test("parsing goes through the digits, not through a float", () => {
  // Number("84500.15") * 100 is 8450014.999999999 — the exact failure this
  // module exists to prevent, at the one point the value is still exact.
  assert.equal(toPesewas(column("84500.15")), 8_450_015);
  assert.equal(toPesewas(column("1.005")), 101, "half away from zero at the pesewa");
  assert.equal(toPesewas(column("1.004")), 100);
  assert.equal(toPesewas(column("-1.005")), -101);
  assert.equal(toPesewas(column("0.001")), 0);
  // A Decimal stringifies small values with an exponent.
  assert.equal(toPesewas(column("1e2")), 10_000);
  assert.equal(toPesewas(column("1.5e3")), 150_000);
  assert.equal(toPesewas(column("1e-2")), 1);
});

test("toDecimalString is exact for amounts a float would round", () => {
  assert.equal(toDecimalString(0), "0.00");
  assert.equal(toDecimalString(5), "0.05");
  assert.equal(toDecimalString(-5), "-0.05");
  assert.equal(toDecimalString(99), "0.99");
  assert.equal(toDecimalString(100), "1.00");
  assert.equal(toDecimalString(8_450_015), "84500.15");
  assert.equal(toDecimalString(-125_075), "-1250.75");
});

test("the float errors this module exists to prevent do not occur", () => {
  // 0.1 + 0.2 !== 0.3 in binary floating point.
  assert.equal(sum([toPesewas(0.1), toPesewas(0.2)]), toPesewas(0.3));

  // 1234.56 * 3 === 3703.6800000000003 as a float.
  assert.equal(lineAmount(3, toPesewas(1234.56)), toPesewas(3703.68));

  // A twenty-line quotation at an awkward unit price still totals exactly.
  const line = toPesewas(19.99);
  assert.equal(sum(Array.from({ length: 20 }, () => lineAmount(7, line))), toPesewas(2798.6));
});

test("roundHalfAway is symmetric about zero", () => {
  assert.equal(roundHalfAway(2.5), 3);
  assert.equal(roundHalfAway(-2.5), -3, "Math.round would give -2 and a refund would not cancel");
  assert.equal(roundHalfAway(2.4), 2);
  assert.equal(roundHalfAway(-2.4), -2);
  assert.equal(roundHalfAway(0), 0);
});

test("applyRate rounds once, to the pesewa", () => {
  assert.equal(applyRate(toPesewas(10_000), 500), toPesewas(500), "+5% of GH₵10,000");
  assert.equal(applyRate(toPesewas(10_000), 1000), toPesewas(1000), "+10%");
  assert.equal(applyRate(toPesewas(10_000), 1800), toPesewas(1800), "+18%");
  assert.equal(applyRate(toPesewas(84_500), 1800), toPesewas(15_210), "+18% of an analyser");
  // 7.5% of GH₵33.33 is 2.49975 — one rounding, not two.
  assert.equal(applyRate(toPesewas(33.33), 750), toPesewas(2.5));
  assert.equal(applyRate(0, 1800), 0);
  assert.equal(applyRate(toPesewas(10_000), 0), 0);
});

test("the worked example from the brief", () => {
  // "if the outright price is GH₵10,000 and the selected plan adds 10%, the
  // adjusted total is GH₵11,000 before any other applicable charges."
  const outright = toPesewas(10_000);
  const uplift = applyRate(outright, percentToBasisPoints(10));
  assert.equal(outright + uplift, toPesewas(11_000));
  assert.equal(formatPesewas(outright + uplift), "GH₵11,000.00");
});

test("basis points carry a rate without losing a digit", () => {
  assert.equal(percentToBasisPoints(12.5), 1250);
  assert.equal(percentToBasisPoints("12.5"), 1250);
  assert.equal(percentToBasisPoints(0), 0);
  assert.equal(percentToBasisPoints(null), 0);
  assert.equal(basisPointsToPercent(1250), 12.5);
  assert.equal(toBasisPoints(column("0.1250")), 1250);
  assert.equal(basisPointsToDecimalString(1250), "0.1250");
  assert.equal(basisPointsToDecimalString(0), "0.0000");
  assert.equal(basisPointsToDecimalString(10_000), "1.0000", "100%");
  assert.equal(formatRate(1250), "12.5%", "not 12.50% — that is false precision");
  assert.equal(formatRate(500), "5%");
});

test("splitEvenly instalments always add back to the total", () => {
  // GH₵10,000 over 3 is 3,333.33 three times = 9,999.99. The pesewa has to go
  // somewhere, and it goes to the first payment.
  const parts = splitEvenly(toPesewas(10_000), 3);
  assert.equal(sum(parts), toPesewas(10_000));
  assert.deepEqual(parts, [toPesewas(3333.34), toPesewas(3333.33), toPesewas(3333.33)]);

  for (const total of [1, 99, 100, 333_333, 1_000_000, 8_450_000]) {
    for (const n of [1, 2, 3, 4, 6, 7, 12, 24]) {
      const split = splitEvenly(total, n);
      assert.equal(split.length, n);
      assert.equal(sum(split), total, `${total} over ${n}`);
      // Never more than a pesewa apart, so no customer sees a lumpy schedule.
      assert.ok(Math.max(...split) - Math.min(...split) <= 1, `${total} over ${n}`);
    }
  }
});

test("splitEvenly handles the degenerate cases", () => {
  assert.deepEqual(splitEvenly(toPesewas(500), 0), []);
  assert.deepEqual(splitEvenly(toPesewas(500), 1), [toPesewas(500)]);
  assert.equal(sum(splitEvenly(-toPesewas(10_000), 3)), -toPesewas(10_000), "a refund schedule");
});

test("apportion spreads a landed cost without losing a pesewa", () => {
  // GH₵1,000 of shipping across three lines worth 500 / 300 / 200.
  const shares = apportion(toPesewas(1000), [500, 300, 200]);
  assert.equal(sum(shares), toPesewas(1000));
  assert.deepEqual(shares, [toPesewas(500), toPesewas(300), toPesewas(200)]);

  // The case naive rounding loses: three equal lines, an amount that does not
  // divide by three.
  const awkward = apportion(toPesewas(100), [1, 1, 1]);
  assert.equal(sum(awkward), toPesewas(100));

  // Weights that sum to zero still have to put the money somewhere.
  const zeroWeights = apportion(toPesewas(90), [0, 0, 0]);
  assert.equal(sum(zeroWeights), toPesewas(90));

  assert.deepEqual(apportion(toPesewas(50), []), []);
});

test("apportion never drifts, across a range of orders", () => {
  const weights = [1234, 56, 7890, 12, 345, 6789];
  for (const amount of [1, 7, 99, 1_000, 123_457, 9_999_999]) {
    const shares = apportion(amount, weights);
    assert.equal(sum(shares), amount, `${amount}`);
    assert.equal(shares.length, weights.length);
    assert.ok(shares.every((n) => n >= 0));
  }
});

test("floorAtZero stops a discount becoming credit", () => {
  assert.equal(floorAtZero(toPesewas(-50)), 0);
  assert.equal(floorAtZero(toPesewas(50)), toPesewas(50));
  assert.equal(floorAtZero(0), 0);
});

test("formatting matches the retail conventions", () => {
  assert.equal(formatPesewas(toPesewas(1250)), "GH₵1,250.00");
  assert.equal(formatPesewas(toPesewas(5.5)), "GH₵5.50", "never GH₵5.5 in a column");
  assert.equal(formatPesewas(toPesewas(-30)), "−GH₵30.00", "the sign leads the symbol");
  assert.equal(formatPesewas(0), "GH₵0.00");
  assert.equal(toCedis(125_075), 1250.75);
});
