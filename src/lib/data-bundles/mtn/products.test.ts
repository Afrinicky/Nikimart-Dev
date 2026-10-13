import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProductMapping,
  productCodeFor,
  productRows,
  serialiseProductMapping,
  unmappedSizes,
} from "./products.ts";

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

test("the rows to edit come from the ladder, not from a list kept here", () => {
  const mapping = parseProductMapping("5 = CODE_5");
  const { ladder } = productRows(mapping, [
    { network: "MTN", sizeGb: 10, isActive: true },
    { network: "MTN", sizeGb: 1, isActive: true },
    { network: "MTN", sizeGb: 5, isActive: true },
    { network: "TELECEL", sizeGb: 15, isActive: true }, // never routes to MTN
  ]);

  // Smallest first, every MTN size present, codes filled in where known.
  assert.deepEqual(
    ladder.map((r) => [r.sizeGb, r.code]),
    [
      [1, ""],
      [5, "CODE_5"],
      [10, ""],
    ],
  );
});

test("a bundle that is not on sale still gets a row, marked as such", () => {
  // So a code can be set before the size goes live, rather than the size going
  // live and quietly routing to the old provider until somebody comes back.
  const { ladder } = productRows(parseProductMapping(""), [
    { network: "MTN", sizeGb: 20, isActive: false },
  ]);
  assert.equal(ladder.length, 1);
  assert.equal(ladder[0].isActive, false);
});

test("a code for a size no longer in the ladder is kept, not discarded", () => {
  const mapping = parseProductMapping("5 = CODE_5\n50 = CODE_50");
  const { ladder, orphans } = productRows(mapping, [
    { network: "MTN", sizeGb: 5, isActive: true },
  ]);
  assert.deepEqual(ladder.map((r) => r.sizeGb), [5]);
  assert.deepEqual(orphans.map((r) => [r.sizeGb, r.code]), [[50, "CODE_50"]]);
});

test("saving is stable: the same rows always write the same string", () => {
  const once = serialiseProductMapping([[10, "CODE_10"], [1, "CODE_1"], [5, "CODE_5"]]);
  const twice = serialiseProductMapping([[5, "CODE_5"], [10, "CODE_10"], [1, "CODE_1"]]);
  assert.equal(once, twice);
  assert.equal(once, "1 = CODE_1\n5 = CODE_5\n10 = CODE_10");
});

test("a cleared code leaves no blank line behind to be read as a problem", () => {
  const text = serialiseProductMapping([[5, "CODE_5"], [10, "   "], [20, ""]]);
  assert.equal(text, "5 = CODE_5");
  assert.deepEqual(parseProductMapping(text).problems, []);
});

test("what is saved is what is read back", () => {
  const text = serialiseProductMapping([[1.5, "CODE_1500MB"], [5, "CODE_5"]]);
  const reparsed = parseProductMapping(text);
  assert.equal(productCodeFor(reparsed, 1.5), "CODE_1500MB");
  assert.equal(productCodeFor(reparsed, 5), "CODE_5");
  assert.deepEqual(reparsed.problems, []);
});
