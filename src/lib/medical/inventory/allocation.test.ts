import assert from "node:assert/strict";
import test from "node:test";
import {
  allocate,
  averageCostOfHeld,
  expired,
  expiringWithin,
  sellableBatches,
  valuation,
  type BatchLike,
} from "./allocation.ts";
import { toPesewas } from "../money.ts";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function batch(partial: Partial<BatchLike> & Pick<BatchLike, "id">): BatchLike {
  return {
    quantityRemaining: 10,
    expiryDate: null,
    receivedAt: day("2026-01-01"),
    unitCost: toPesewas(100),
    isQuarantined: false,
    ...partial,
  };
}

test("first expiry goes first, even when it arrived last", () => {
  // The case FIFO gets wrong, and the reason this is FEFO.
  const old = batch({ id: "old", receivedAt: day("2025-06-01"), expiryDate: day("2026-12-01") });
  const recent = batch({ id: "recent", receivedAt: day("2026-10-01"), expiryDate: day("2026-03-01") });

  const order = sellableBatches([old, recent]).map((b) => b.id);
  assert.deepEqual(order, ["recent", "old"], "the March lot must move before the December one");

  const result = allocate([old, recent], 12);
  assert.equal(result.allocations[0].batchId, "recent");
  assert.equal(result.allocations[0].quantity, 10);
  assert.equal(result.allocations[1].batchId, "old");
  assert.equal(result.allocations[1].quantity, 2);
  assert.equal(result.shortfall, 0);
});

test("a batch with no expiry is consumed last", () => {
  const perishable = batch({ id: "perishable", expiryDate: day("2027-01-01") });
  const forever = batch({ id: "forever", expiryDate: null });
  assert.deepEqual(sellableBatches([forever, perishable]).map((b) => b.id), [
    "perishable",
    "forever",
  ]);
});

test("same expiry falls back to oldest receipt", () => {
  const first = batch({ id: "first", receivedAt: day("2026-01-01"), expiryDate: day("2027-01-01") });
  const second = batch({ id: "second", receivedAt: day("2026-05-01"), expiryDate: day("2027-01-01") });
  assert.deepEqual(sellableBatches([second, first]).map((b) => b.id), ["first", "second"]);
});

test("quarantined stock is never allocated", () => {
  const held = batch({ id: "held", isQuarantined: true, quantityRemaining: 100 });
  const free = batch({ id: "free", quantityRemaining: 4 });

  const result = allocate([held, free], 10);
  assert.deepEqual(result.allocations.map((a) => a.batchId), ["free"]);
  assert.equal(result.allocated, 4);
  assert.equal(result.shortfall, 6, "the quarantined hundred does not count as available");
});

test("a shortfall is reported, not silently filled", () => {
  const result = allocate([batch({ id: "a", quantityRemaining: 3 })], 10);
  assert.equal(result.allocated, 3);
  assert.equal(result.shortfall, 7);
  assert.equal(result.allocations.length, 1);
});

test("cost of goods comes from the batches, not from today's price", () => {
  const cheap = batch({ id: "cheap", quantityRemaining: 6, unitCost: toPesewas(280), expiryDate: day("2026-03-01") });
  const dear = batch({ id: "dear", quantityRemaining: 10, unitCost: toPesewas(310), expiryDate: day("2026-09-01") });

  const result = allocate([cheap, dear], 10);
  // 6 at 280 then 4 at 310 — FEFO, so the cheaper short-dated lot goes first.
  assert.equal(result.costOfGoods, toPesewas(6 * 280 + 4 * 310));
  assert.equal(result.allocated, 10);
});

test("allocating nothing, or from nothing, is not an error", () => {
  assert.deepEqual(allocate([], 10).allocations, []);
  assert.equal(allocate([], 10).shortfall, 10);
  assert.equal(allocate([batch({ id: "a" })], 0).allocated, 0);
  assert.equal(allocate([batch({ id: "a" })], -5).allocated, 0);
});

test("valuation counts quarantined goods, availability does not", () => {
  const batches = [
    batch({ id: "free", quantityRemaining: 10, unitCost: toPesewas(100) }),
    batch({ id: "held", quantityRemaining: 5, unitCost: toPesewas(200), isQuarantined: true }),
  ];
  const result = valuation(batches);
  assert.equal(result.units, 15, "the business owns all fifteen");
  assert.equal(result.value, toPesewas(10 * 100 + 5 * 200));
  assert.equal(result.quarantinedUnits, 5);

  assert.equal(allocate(batches, 15).allocated, 10, "but only ten can be sold");
});

test("average cost of held stock is weighted by what is on the shelf", () => {
  const batches = [
    batch({ id: "a", quantityRemaining: 80, unitCost: toPesewas(280) }),
    batch({ id: "b", quantityRemaining: 20, unitCost: toPesewas(310) }),
  ];
  assert.equal(averageCostOfHeld(batches), toPesewas(286));
  assert.equal(averageCostOfHeld([]), 0);
});

test("expiring and expired are different questions", () => {
  const now = day("2026-10-24");
  const batches = [
    batch({ id: "gone", quantityRemaining: 4, expiryDate: day("2026-09-01") }),
    batch({ id: "soon", quantityRemaining: 4, expiryDate: day("2026-12-01") }),
    batch({ id: "later", quantityRemaining: 4, expiryDate: day("2027-06-01") }),
    batch({ id: "empty", quantityRemaining: 0, expiryDate: day("2026-11-01") }),
  ];

  assert.deepEqual(expired(batches, now).map((b) => b.id), ["gone"]);
  assert.deepEqual(expiringWithin(batches, 90, now).map((b) => b.id), ["soon"]);
  assert.equal(
    expiringWithin(batches, 90, now).find((b) => b.id === "empty"),
    undefined,
    "a batch with nothing left in it is not expiring stock",
  );
});
