import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductMapping, productCodeFor, unmappedSizes } from "./products.ts";

/**
 * The size-to-product-code mapping an admin types on the Developer tab.
 *
 * A code that silently fails to parse is the worst outcome here: the switch
 * looks configured, and the first anyone learns otherwise is a customer who
 * has paid. So an unreadable line is reported, never dropped.
 *
 * Run with: npm test
 */

test("a mapping is read whichever separator was typed", () => {
  const mapping = parseProductMapping("5 = CODE_5\n10: CODE_10\n20 CODE_20");
  assert.equal(productCodeFor(mapping, 5), "CODE_5");
  assert.equal(productCodeFor(mapping, 10), "CODE_10");
  assert.equal(productCodeFor(mapping, 20), "CODE_20");
  assert.deepEqual(mapping.problems, []);
});

test("blank lines and comments are not problems", () => {
  const mapping = parseProductMapping("\n  \n# the 5GB bundle\n5 = CODE_5 # live\n\n");
  assert.equal(productCodeFor(mapping, 5), "CODE_5");
  assert.deepEqual(mapping.problems, []);
});

test("fractional sizes match however they were written", () => {
  const mapping = parseProductMapping("1.5 = CODE_1500MB");
  assert.equal(productCodeFor(mapping, 1.5), "CODE_1500MB");
  assert.equal(productCodeFor(mapping, 1.50), "CODE_1500MB");
});

test("a line that cannot be read is reported, not quietly skipped", () => {
  const mapping = parseProductMapping("5 = CODE_5\nnonsense\n0 = CODE_ZERO\n-3 = CODE_NEG");
  assert.equal(productCodeFor(mapping, 5), "CODE_5");
  assert.ok(mapping.problems.includes("nonsense"));
  assert.ok(mapping.problems.includes("0 = CODE_ZERO"));
  assert.ok(mapping.problems.includes("-3 = CODE_NEG"));
});

test("an unmapped size has no code — it is never guessed at", () => {
  const mapping = parseProductMapping("5 = CODE_5");
  assert.equal(productCodeFor(mapping, 10), null);
  assert.equal(productCodeFor(parseProductMapping(""), 5), null);
  assert.equal(productCodeFor(parseProductMapping(null), 5), null);
});

test("the console can see which MTN bundles are still missing a code", () => {
  const mapping = parseProductMapping("5 = CODE_5");
  const missing = unmappedSizes(mapping, [
    { network: "MTN", sizeGb: 5, isActive: true },
    { network: "MTN", sizeGb: 10, isActive: true },
    { network: "MTN", sizeGb: 20, isActive: false }, // not on sale, not a gap
    { network: "TELECEL", sizeGb: 15, isActive: true }, // never routes to MTN
  ]);
  assert.deepEqual(missing, [10]);
});

test("a later line wins, so a corrected code replaces the one above it", () => {
  const mapping = parseProductMapping("5 = OLD_CODE\n5 = NEW_CODE");
  assert.equal(productCodeFor(mapping, 5), "NEW_CODE");
});
