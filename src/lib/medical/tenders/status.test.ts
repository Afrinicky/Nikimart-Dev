import assert from "node:assert/strict";
import test from "node:test";
import {
  awardedLineValue,
  deadlinePressure,
  mayDeriveStatus,
  summarise,
  type OutcomeLine,
} from "./status.ts";
import { toPesewas } from "../money.ts";

function line(partial: Partial<OutcomeLine> = {}): OutcomeLine {
  return {
    outcome: "PENDING",
    isNoBid: false,
    quantity: 100,
    awardedQuantity: 0,
    unitPrice: toPesewas(58),
    awardedUnitPrice: 0,
    unitCostAtBid: toPesewas(40),
    ...partial,
  };
}

test("a tender of many lines has many outcomes, not one", () => {
  // The case the whole module exists for: eleven won, twenty-six lost, three
  // partial. A system that records one verdict calls this a loss.
  const lines = [
    ...Array.from({ length: 11 }, () => line({ outcome: "AWARDED", awardedQuantity: 100 })),
    ...Array.from({ length: 26 }, () => line({ outcome: "NOT_AWARDED" })),
    ...Array.from({ length: 3 }, () =>
      line({ outcome: "PARTIALLY_AWARDED", awardedQuantity: 40 }),
    ),
  ];

  const result = summarise(lines);
  assert.equal(result.status, "PARTIALLY_AWARDED");
  assert.equal(result.awardedLines, 11);
  assert.equal(result.partiallyAwardedLines, 3);
  assert.equal(result.lostLines, 26);
  assert.equal(result.bidLines, 40);
  assert.equal(result.hitRate, 35, "14 of 40");
});

test("every line awarded in full is AWARDED", () => {
  const result = summarise([
    line({ outcome: "AWARDED", awardedQuantity: 100 }),
    line({ outcome: "AWARDED", awardedQuantity: 50, quantity: 50 }),
  ]);
  assert.equal(result.status, "AWARDED");
  assert.equal(result.hitRate, 100);
});

test("nothing awarded is NOT_AWARDED", () => {
  const result = summarise([line({ outcome: "NOT_AWARDED" }), line({ outcome: "NOT_AWARDED" })]);
  assert.equal(result.status, "NOT_AWARDED");
  assert.equal(result.hitRate, 0);
  assert.equal(result.awardedValue, 0);
});

test("one pending line keeps the whole tender under evaluation", () => {
  // Calling a tender awarded while a line is undecided is what makes a
  // pipeline figure useless.
  const result = summarise([
    line({ outcome: "AWARDED", awardedQuantity: 100 }),
    line({ outcome: "PENDING" }),
  ]);
  assert.equal(result.status, "UNDER_EVALUATION");
  assert.equal(result.hitRate, null, "a hit rate before the result is in would be quoted and wrong");
});

test("no-bid lines count in neither the win nor the loss", () => {
  const result = summarise([
    line({ outcome: "AWARDED", awardedQuantity: 100 }),
    line({ isNoBid: true, outcome: "PENDING" }),
    line({ isNoBid: true, outcome: "PENDING" }),
  ]);
  assert.equal(result.bidLines, 1, "we bid one line");
  assert.equal(result.noBidLines, 2);
  assert.equal(result.status, "AWARDED", "the lines we did not bid cannot hold it pending");
  assert.equal(result.hitRate, 100);
});

test("a tender with nothing bid stays IDENTIFIED", () => {
  assert.equal(summarise([]).status, "IDENTIFIED");
  assert.equal(summarise([line({ isNoBid: true })]).status, "IDENTIFIED");
  assert.equal(summarise([]).hitRate, null);
});

test("an award at the institution's own price, not ours", () => {
  const awarded = line({
    outcome: "AWARDED",
    quantity: 100,
    awardedQuantity: 100,
    unitPrice: toPesewas(58),
    awardedUnitPrice: toPesewas(54),
  });
  assert.equal(awardedLineValue(awarded), toPesewas(5_400), "54, not 58");

  const result = summarise([awarded]);
  assert.equal(result.offeredValue, toPesewas(5_800));
  assert.equal(result.awardedValue, toPesewas(5_400));
});

test("a partial award is valued at the quantity actually awarded", () => {
  const partial = line({
    outcome: "PARTIALLY_AWARDED",
    quantity: 100,
    awardedQuantity: 40,
    unitPrice: toPesewas(58),
  });
  assert.equal(awardedLineValue(partial), toPesewas(2_320), "40 × 58");
});

test("a lost line is worth nothing even with figures on it", () => {
  const lost = line({ outcome: "NOT_AWARDED", awardedQuantity: 100, awardedUnitPrice: toPesewas(58) });
  assert.equal(awardedLineValue(lost), 0);
});

test("margin on an award is measured against what it cost when we bid", () => {
  const result = summarise([
    line({ outcome: "AWARDED", awardedQuantity: 100, unitPrice: toPesewas(58), unitCostAtBid: toPesewas(40) }),
    line({ outcome: "NOT_AWARDED", unitCostAtBid: toPesewas(40) }),
  ]);
  assert.equal(result.awardedValue, toPesewas(5_800));
  assert.equal(result.awardedCost, toPesewas(4_000), "only the awarded line costs anything");
  assert.equal(result.awardedMargin, toPesewas(1_800));
});

test("decisions are not overwritten by derived results", () => {
  assert.equal(mayDeriveStatus("UNDER_EVALUATION"), true);
  assert.equal(mayDeriveStatus("SUBMITTED"), true);
  assert.equal(mayDeriveStatus("CANCELLED"), false);
  assert.equal(mayDeriveStatus("WITHDRAWN"), false);
  assert.equal(mayDeriveStatus("EXPIRED"), false);
});

test("deadline pressure gives time to actually act", () => {
  const now = new Date("2026-10-24T09:00:00Z");
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  assert.equal(deadlinePressure(null, now), "none");
  assert.equal(deadlinePressure(at("2026-10-20"), now), "passed");
  assert.equal(deadlinePressure(at("2026-10-24"), now), "critical", "today");
  assert.equal(deadlinePressure(at("2026-10-31"), now), "critical", "seven days is not much");
  assert.equal(deadlinePressure(at("2026-11-05"), now), "upcoming");
  assert.equal(deadlinePressure(at("2026-12-25"), now), "none");
});
