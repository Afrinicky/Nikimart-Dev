import assert from "node:assert/strict";
import test from "node:test";
import { bestEntryFor, drawdownFor, stateOf, type RegisterEntry } from "./register.ts";
import { toPesewas } from "../money.ts";

const now = new Date("2026-10-24T09:00:00Z");
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

function entry(partial: Partial<RegisterEntry> = {}): RegisterEntry {
  return {
    id: "e1",
    productId: "p1",
    description: "Nitrile gloves, box of 100",
    unitPrice: toPesewas(54),
    unit: "box",
    quantityAwarded: 0,
    quantityDrawn: 0,
    minimumOrderQuantity: 1,
    leadTimeDays: 7,
    validFrom: at("2026-01-01"),
    validUntil: at("2027-03-31"),
    status: "ACTIVE",
    ...partial,
  };
}

test("a live award is usable and says what is left", () => {
  const state = stateOf(entry({ quantityAwarded: 1_000, quantityDrawn: 400 }), now);
  assert.equal(state.status, "ACTIVE");
  assert.equal(state.isUsable, true);
  assert.equal(state.remaining, 600);
  assert.match(state.reason, /600 of 1000 box left/);
});

test("an award past its date is not usable", () => {
  const state = stateOf(entry({ validUntil: at("2026-09-30") }), now);
  assert.equal(state.status, "EXPIRED");
  assert.equal(state.isUsable, false);
  assert.match(state.reason, /Expired 24 days ago/);
});

test("a fully drawn framework is exhausted", () => {
  // The one that is always missed: the award is a ceiling, and the 1,001st box
  // at the awarded price is a loss nobody notices until the year is costed.
  const state = stateOf(entry({ quantityAwarded: 1_000, quantityDrawn: 1_000 }), now);
  assert.equal(state.status, "EXHAUSTED");
  assert.equal(state.isUsable, false);
  assert.equal(state.remaining, 0);
  assert.match(state.reason, /Fully drawn/);
});

test("an over-drawn entry does not report negative remaining", () => {
  const state = stateOf(entry({ quantityAwarded: 100, quantityDrawn: 140 }), now);
  assert.equal(state.remaining, 0);
  assert.equal(state.isUsable, false);
});

test("no ceiling means no ceiling", () => {
  const state = stateOf(entry({ quantityAwarded: 0 }), now);
  assert.equal(state.isUsable, true);
  assert.equal(state.remaining, null);
});

test("a decision wins over anything derived", () => {
  // Recomputing a suspension from the dates would quietly undo it.
  const suspended = stateOf(entry({ status: "SUSPENDED" }), now);
  assert.equal(suspended.isUsable, false);
  assert.match(suspended.reason, /Suspended/);

  const superseded = stateOf(entry({ status: "SUPERSEDED" }), now);
  assert.equal(superseded.isUsable, false);
});

test("an award that has not started yet is not usable", () => {
  const state = stateOf(entry({ validFrom: at("2027-01-01") }), now);
  assert.equal(state.isUsable, false);
  assert.equal(state.reason, "Not in force yet.");
});

test("an award with no expiry stays usable", () => {
  const state = stateOf(entry({ validUntil: null }), now);
  assert.equal(state.isUsable, true);
  assert.equal(state.daysRemaining, null);
  assert.equal(state.reason, "Approved, with no expiry.");
});

test("a quantity above the ceiling splits rather than being refused", () => {
  // What actually happens commercially: part at the agreed price, the rest
  // priced normally. Silently applying the agreed price to the whole line is
  // the failure.
  const split = drawdownFor(entry({ quantityAwarded: 1_000, quantityDrawn: 940 }), 100, now);
  assert.equal(split.atAgreedPrice, 60);
  assert.equal(split.atListPrice, 40);
  assert.equal(split.blocked, false);
});

test("an unusable entry prices nothing at the agreed rate", () => {
  const lapsed = drawdownFor(entry({ validUntil: at("2026-01-01") }), 100, now);
  assert.equal(lapsed.atAgreedPrice, 0);
  assert.equal(lapsed.atListPrice, 100);
  assert.equal(lapsed.blocked, true);
});

test("an open framework covers whatever is asked", () => {
  const open = drawdownFor(entry({ quantityAwarded: 0 }), 5_000, now);
  assert.equal(open.atAgreedPrice, 5_000);
  assert.equal(open.atListPrice, 0);
});

test("the entry expiring soonest is offered first", () => {
  // A framework with three weeks left should be drawn down before one with a
  // year, or the first lapses unused.
  const soon = entry({ id: "soon", validUntil: at("2026-11-15") });
  const later = entry({ id: "later", validUntil: at("2027-06-30") });
  assert.equal(bestEntryFor([later, soon], "p1", now)?.id, "soon");
});

test("an unusable entry is never offered, however cheap", () => {
  const expired = entry({ id: "expired", unitPrice: toPesewas(10), validUntil: at("2026-01-01") });
  const live = entry({ id: "live", unitPrice: toPesewas(54) });
  assert.equal(bestEntryFor([expired, live], "p1", now)?.id, "live");
  assert.equal(bestEntryFor([expired], "p1", now), null);
});

test("entries for other products are not offered", () => {
  assert.equal(bestEntryFor([entry({ productId: "other" })], "p1", now), null);
  assert.equal(bestEntryFor([], "p1", now), null);
});

test("same expiry falls to the lower price", () => {
  const dear = entry({ id: "dear", unitPrice: toPesewas(60) });
  const cheap = entry({ id: "cheap", unitPrice: toPesewas(50) });
  assert.equal(bestEntryFor([dear, cheap], "p1", now)?.id, "cheap");
});
