import { test } from "node:test";
import assert from "node:assert/strict";
import {
  depositDue,
  describeDeposit,
  EMPTY_PREORDER_TERMS,
  parsePreorderTerms,
  serialisePreorderTerms,
  type PreorderTerms,
} from "./preorder.ts";

/**
 * Preorder terms are what a buyer is shown before paying for something that
 * does not exist yet, so the two states that must never blur are "this seller
 * wrote terms" and "this listing has none". The first puts a panel in front of
 * the buyer; the second must not put an empty one there.
 */

const FULL: PreorderTerms = {
  estimatedArrival: "Mid-March 2027",
  closingDate: "28 Feb 2027",
  depositRequired: true,
  depositType: "percentage",
  depositValue: 40,
  balanceInstruction: "Balance due when it lands in Accra.",
  refundPolicy: "Full refund if it does not arrive by April.",
  sourceLocation: "Guangzhou, China",
  minimumOrders: 10,
};

test("terms survive the round trip", () => {
  const stored = serialisePreorderTerms(FULL);
  assert.ok(stored);
  assert.deepEqual(parsePreorderTerms(stored), FULL);
});

test("nothing usable reads as no terms at all", () => {
  for (const raw of [undefined, null, "", "   ", "not json", "[]", '"x"', "123"]) {
    assert.equal(parsePreorderTerms(raw), null, `expected null for ${JSON.stringify(raw)}`);
  }
  // An object whose every field is blank says nothing, so it is not terms.
  assert.equal(parsePreorderTerms(JSON.stringify(EMPTY_PREORDER_TERMS)), null);
  assert.equal(parsePreorderTerms("{}"), null);
});

test("an untouched form clears the column instead of storing an empty husk", () => {
  assert.equal(serialisePreorderTerms(EMPTY_PREORDER_TERMS), null);
  assert.equal(serialisePreorderTerms({ ...EMPTY_PREORDER_TERMS, estimatedArrival: "   " }), null);
});

test("one filled field is enough to be terms", () => {
  const only = { ...EMPTY_PREORDER_TERMS, refundPolicy: "No refunds after dispatch." };
  const stored = serialisePreorderTerms(only);
  assert.ok(stored);
  assert.equal(parsePreorderTerms(stored)?.refundPolicy, "No refunds after dispatch.");
});

test("a deposit flagged but priced at zero is not a deposit", () => {
  // Otherwise a buyer is shown "Deposit: 0%" and infers a part-payment that the
  // seller never asked for.
  const zero = { ...EMPTY_PREORDER_TERMS, depositRequired: true, depositValue: 0 };
  assert.equal(serialisePreorderTerms(zero), null);
  assert.equal(
    parsePreorderTerms(JSON.stringify({ ...zero, refundPolicy: "x" }))?.depositRequired,
    false,
  );
});

test("junk values are coerced rather than trusted", () => {
  const parsed = parsePreorderTerms(
    JSON.stringify({
      estimatedArrival: 42,
      depositRequired: "yes",
      depositType: "wishful",
      depositValue: "-5",
      minimumOrders: "abc",
      refundPolicy: "  Refunds within 7 days.  ",
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed.estimatedArrival, ""); // a number is not a description
  assert.equal(parsed.depositType, "percentage"); // unknown type falls back
  assert.equal(parsed.depositValue, 0); // negative is not an amount
  assert.equal(parsed.depositRequired, false); // no amount, so no deposit
  assert.equal(parsed.minimumOrders, 0);
  assert.equal(parsed.refundPolicy, "Refunds within 7 days.");
});

/** What the buyer is actually asked to pay now. */

test("a percentage deposit is taken off the line total", () => {
  assert.equal(depositDue(FULL, 1000, 1), 400);
  assert.equal(depositDue(FULL, 1000, 2), 800);
  // Rounded to the pesewa rather than left with floating-point tails.
  assert.equal(depositDue({ ...FULL, depositValue: 33 }, 99.99, 1), 33);
});

test("a fixed deposit is per item", () => {
  const fixed: PreorderTerms = { ...FULL, depositType: "fixed_amount", depositValue: 150 };
  assert.equal(depositDue(fixed, 1000, 1), 150);
  assert.equal(depositDue(fixed, 1000, 3), 450);
});

test("a deposit never exceeds the price of what it is for", () => {
  // A fixed deposit left behind by a price cut must not ask for more than the
  // item now costs.
  const fixed: PreorderTerms = { ...FULL, depositType: "fixed_amount", depositValue: 900 };
  assert.equal(depositDue(fixed, 500, 1), 500);
  assert.equal(depositDue({ ...FULL, depositValue: 150 }, 200, 1), 200);
});

test("no deposit means the whole price is due now", () => {
  assert.equal(depositDue({ ...FULL, depositRequired: false }, 1000, 1), null);
  assert.equal(describeDeposit({ ...FULL, depositRequired: false }), "Paid in full at checkout");
  assert.equal(describeDeposit(FULL), "40% deposit");
  assert.equal(
    describeDeposit({ ...FULL, depositType: "fixed_amount", depositValue: 150 }),
    "GH₵150 deposit",
  );
});
