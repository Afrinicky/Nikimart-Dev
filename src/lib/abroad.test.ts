import { test } from "node:test";
import assert from "node:assert/strict";
import {
  depositDue,
  describeDeposit,
  EMPTY_ABROAD_TERMS,
  isAbroadType,
  isSafeSourceUrl,
  normaliseProductType,
  parseAbroadTerms,
  serialiseAbroadTerms,
  type AbroadTerms,
} from "./abroad.ts";

/**
 * Shipped-from-abroad terms are what a buyer is shown before paying for
 * something that is still in another country, so the two states that must never
 * blur are "this seller wrote terms" and "this listing has none". The first
 * puts a panel in front of the buyer; the second must not put an empty one
 * there.
 */

const FULL: AbroadTerms = {
  sourceUrl: "https://www.alibaba.com/product-detail/widget",
  supplierName: "Shenzhen Kaiyuan Trading Co.",
  sourceLocation: "Guangzhou, China",
  originCountry: "CN",
  estimatedArrival: "4–6 weeks from order",
  processingDays: 5,
  minimumOrders: 10,
  freightMode: "sea",
  arrivalPointId: "ap-tema",
  supplierFreight: 40,
  intlFreight: 0,
  freightIncluded: false,
  originTaxRate: 13,
  ghanaTaxRate: 21.9,
  dutyIncluded: false,
  depositRequired: true,
  depositType: "percentage",
  depositValue: 40,
  balanceInstruction: "Balance due when it lands in Accra.",
  refundPolicy: "Full refund if it has not arrived within 10 weeks.",
  allowFreightOnArrival: true,
};

test("terms survive the round trip", () => {
  const stored = serialiseAbroadTerms(FULL);
  assert.ok(stored);
  assert.deepEqual(parseAbroadTerms(stored), FULL);
});

test("nothing usable reads as no terms at all", () => {
  for (const raw of [undefined, null, "", "   ", "not json", "[]", '"x"', "123"]) {
    assert.equal(parseAbroadTerms(raw), null, `expected null for ${JSON.stringify(raw)}`);
  }
  // An object with nothing a buyer could act on is the same as no terms: it
  // would render a labelled empty box captioned "what you are agreeing to".
  assert.equal(parseAbroadTerms(JSON.stringify(EMPTY_ABROAD_TERMS)), null);
  assert.equal(serialiseAbroadTerms(EMPTY_ABROAD_TERMS), null);
});

test("a legacy preorder record still parses", () => {
  // Every listing made before the rename is stored in this shape and is never
  // backfilled, so reading it has to keep working. `closingDate` is dropped —
  // ordering no longer closes — and the freight legs come back at zero, which
  // is exactly what those listings were: a price with no route behind it.
  const legacy = JSON.stringify({
    estimatedArrival: "3-4 weeks",
    closingDate: "2026-07-10",
    depositRequired: true,
    depositType: "percentage",
    depositValue: 30,
    balanceInstruction: "Pay the balance on arrival.",
    refundPolicy: "Deposit refunded if cancelled before the closing date.",
    sourceLocation: "Dubai, UAE",
    preorderStatus: "open",
  });
  const terms = parseAbroadTerms(legacy);
  assert.ok(terms);
  assert.equal(terms.estimatedArrival, "3-4 weeks");
  assert.equal(terms.sourceLocation, "Dubai, UAE");
  assert.equal(terms.depositValue, 30);
  assert.equal(terms.supplierFreight, 0);
  assert.equal(terms.intlFreight, 0);
  assert.equal(terms.arrivalPointId, "");
  // No listing-level Ghana tax rate means "use the platform rate".
  assert.equal(terms.ghanaTaxRate, -1);
  assert.equal("closingDate" in terms, false);
});

test("a deposit flagged but priced at zero is not a deposit", () => {
  // Otherwise a buyer is shown "Deposit: 0%" and infers a part-payment the
  // seller never asked for.
  const terms = parseAbroadTerms(
    JSON.stringify({ ...FULL, depositRequired: true, depositValue: 0 }),
  );
  assert.ok(terms);
  assert.equal(terms.depositRequired, false);
  assert.equal(describeDeposit(terms), "Paid in full at checkout");
  assert.equal(depositDue(terms, 500), null);
});

test("a fixed deposit never exceeds what the item costs", () => {
  // A deposit left over from a higher price must not ask for more than the
  // thing is now listed at.
  const terms: AbroadTerms = { ...FULL, depositType: "fixed_amount", depositValue: 900 };
  assert.equal(depositDue(terms, 500, 1), 500);
  // Per unit, so two units at 500 admit the full 900 deposit.
  assert.equal(depositDue(terms, 500, 2), 1000);
  assert.equal(depositDue({ ...FULL, depositValue: 40 }, 500, 2), 400);
});

test("an unsafe source URL is dropped rather than stored", () => {
  // This URL ends up in an anchor on a public product page, so anything that
  // isn't an absolute http(s) address has no business surviving the parse.
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "//evil.tld/x", "ftp://x/y"]) {
    assert.equal(isSafeSourceUrl(bad), false, bad);
    const terms = parseAbroadTerms(JSON.stringify({ ...FULL, sourceUrl: bad }));
    assert.ok(terms);
    assert.equal(terms.sourceUrl, "");
  }
  assert.equal(isSafeSourceUrl("https://alibaba.com/x"), true);
});

test("an unknown freight mode falls back rather than reaching the rate table", () => {
  const terms = parseAbroadTerms(JSON.stringify({ ...FULL, freightMode: "teleport" }));
  assert.ok(terms);
  assert.equal(terms.freightMode, "sea");
});

test("both spellings of the product type mean the same thing", () => {
  // Listings made before the rename are stored as "preorder" and are never
  // backfilled, so the reconciliation lives here rather than in the database.
  assert.equal(isAbroadType("preorder"), true);
  assert.equal(isAbroadType("shipped_from_abroad"), true);
  assert.equal(isAbroadType("in_stock"), false);
  assert.equal(isAbroadType(null), false);
  assert.equal(normaliseProductType("preorder"), "shipped_from_abroad");
  assert.equal(normaliseProductType("service"), "service");
  assert.equal(normaliseProductType(""), "in_stock");
});
