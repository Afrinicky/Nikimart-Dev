import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
  supplierContact: "+86 000 000 0000",
  sourceLocation: "Guangzhou, China",
  originCountry: "CN",
  estimatedArrival: "4–6 weeks from order",
  processingDays: 5,
  minimumOrders: 10,
  supplierDelivers: false,
  forwarderId: "fw-gz",
  consolidationPointId: "cp-tema",
  routeId: "rt-sea",
  supplierFreight: 40,
  balanceInstruction: "Shipping settled when you collect in Accra.",
  refundPolicy: "Full refund if it has not arrived within 10 weeks.",
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
  // Deposits are gone: the goods are paid for in full at checkout, so a
  // deposit written under the old rules is dropped rather than honoured.
  assert.equal("depositValue" in terms, false);
  assert.equal(terms.supplierFreight, 0);
  assert.equal(terms.forwarderId, "");
  assert.equal(terms.consolidationPointId, "");
  // A lane nobody named is no lane: the listing form asks for one.
  assert.equal(terms.routeId, "");
  assert.equal("closingDate" in terms, false);
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

test("the old names for the same promises are still read", () => {
  // Listings written under the previous system said "freightIncluded" for what
  // is now "the supplier delivers", and kept the consolidation point under
  // "arrivalPointId". Nothing is backfilled, so both have to keep parsing.
  const legacy = parseAbroadTerms(
    JSON.stringify({
      sourceLocation: "Guangzhou, China",
      freightIncluded: true,
      arrivalPointId: "ap-tema",
    }),
  );
  assert.ok(legacy);
  assert.equal(legacy.supplierDelivers, true);
  assert.equal(legacy.consolidationPointId, "ap-tema");
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
