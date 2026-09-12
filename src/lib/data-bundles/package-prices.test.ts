import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cheapestByBundle,
  parsePackages,
  planCostUpdates,
  priceToCedis,
  sizeToGb,
} from "./package-prices.ts";

/**
 * Reading the provider's price list.
 *
 * Everything the bundle store earns is measured from the cost price, so a
 * misread here is not a cosmetic bug: a size read in the wrong unit prices a
 * 10GB bundle as if it were 10MB, and a zero cost makes every sale look like
 * pure margin until somebody reconciles the wallet.
 *
 * Run with: npm test
 */

test("sizes come back in GB whichever unit the provider quoted", () => {
  // The order API quotes GB…
  assert.equal(sizeToGb(1), 1);
  assert.equal(sizeToGb(100), 100);
  // …and the package catalogue quotes MB for exactly the same bundles.
  assert.equal(sizeToGb(1000), 1);
  assert.equal(sizeToGb(10000), 10);
  assert.equal(sizeToGb("2000"), 2);
});

test("a size that isn't a positive number is refused, not guessed", () => {
  assert.equal(sizeToGb(0), null);
  assert.equal(sizeToGb(-5), null);
  assert.equal(sizeToGb("unlimited"), null);
  assert.equal(sizeToGb(undefined), null);
});

test("prices arrive in pesewas and are kept in cedis", () => {
  assert.equal(priceToCedis(415), 4.15);
  assert.equal(priceToCedis(2075), 20.75);
  assert.equal(priceToCedis("830"), 8.3);
  assert.equal(priceToCedis("nope"), null);
});

test("rows we can't price are dropped rather than written as zero", () => {
  const parsed = parsePackages([
    { network: "MTN", size: 1000, price: 415 },
    { network: "GLO", size: 1000, price: 415 }, // not a network we sell
    { network: "MTN", size: 0, price: 415 }, // no size
    { network: "MTN", size: 2000, price: 0 }, // free is not a cost
    "nonsense",
    null,
  ]);
  assert.deepEqual(parsed, [{ network: "MTN", sizeGb: 1, cost: 4.15, available: true }]);
});

test("availability is only believed when it is actually said", () => {
  const [listed, withdrawn] = parsePackages([
    { network: "MTN", size: 1000, price: 415 },
    { network: "MTN", size: 2000, price: 830, available: false },
  ]);
  assert.equal(listed.available, true);
  assert.equal(withdrawn.available, false);
});

test("a bundle listed twice takes the cheaper, and a withdrawn row never counts", () => {
  const best = cheapestByBundle(
    parsePackages([
      { network: "MTN", size: 1000, price: 450 },
      { network: "MTN", size: 1000, price: 415 },
      { network: "TELECEL", size: 5000, price: 2000, available: false },
    ]),
  );
  assert.equal(best.get("MTN:1")?.cost, 4.15);
  assert.equal(best.has("TELECEL:5"), false);
});

test("only bundles whose cost actually moved are written", () => {
  const plan = planCostUpdates(
    [
      { id: "a", network: "MTN", sizeGb: 1, costPrice: 4.15 }, // unchanged
      { id: "b", network: "MTN", sizeGb: 2, costPrice: 8.3 }, // moved
      { id: "c", network: "TELECEL", sizeGb: 5, costPrice: 20 }, // not listed
    ],
    parsePackages([
      { network: "MTN", size: 1000, price: 415 },
      { network: "MTN", size: 2000, price: 845 },
    ]),
  );

  assert.deepEqual(
    plan.changes,
    [{ id: "b", network: "MTN", sizeGb: 2, from: 8.3, to: 8.45 }],
  );
  // A bundle the provider stopped listing keeps the cost we last knew, and is
  // reported instead of being silently zeroed.
  assert.deepEqual(plan.unmatched, [{ network: "TELECEL", sizeGb: 5 }]);
});

test("a bundle that has never had a cost is picked up on the first sync", () => {
  const plan = planCostUpdates(
    [{ id: "a", network: "MTN", sizeGb: 3, costPrice: 0 }],
    parsePackages([{ network: "MTN", size: 3000, price: 1245 }]),
  );
  assert.deepEqual(plan.changes, [
    { id: "a", network: "MTN", sizeGb: 3, from: 0, to: 12.45 },
  ]);
});
