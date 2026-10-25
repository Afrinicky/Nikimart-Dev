import assert from "node:assert/strict";
import test from "node:test";
import {
  can,
  effectiveStatus,
  hasLapsed,
  isClosed,
  isEditable,
  isQuotationStatus,
  movesFrom,
  nextAction,
  QUOTATION_STATUSES,
} from "./status.ts";

test("an issued document is frozen", () => {
  // The rule the whole module exists for: a customer has a copy, so the lines
  // and prices stop being editable the moment it is issued. A price that has to
  // change becomes a new version.
  assert.equal(isEditable("DRAFT"), true);
  for (const status of QUOTATION_STATUSES) {
    if (status === "DRAFT") continue;
    assert.equal(isEditable(status), false, `${status} must not be editable`);
  }
});

test("a draft cannot be accepted, sent or converted", () => {
  // Each of these would mean a customer agreeing to something nobody has
  // issued them.
  assert.equal(can("DRAFT", "SEND"), false);
  assert.equal(can("DRAFT", "ACCEPT"), false);
  assert.equal(can("DRAFT", "CONVERT"), false);
  assert.equal(can("DRAFT", "ISSUE"), true);
});

test("only an accepted quotation converts to an order", () => {
  for (const status of QUOTATION_STATUSES) {
    assert.equal(
      can(status, "CONVERT"),
      status === "ACCEPTED",
      `${status} must not convert`,
    );
  }
});

test("viewed behaves exactly as sent", () => {
  // Knowing the customer opened it is useful to a salesperson and changes
  // nothing about what may be done to the document.
  assert.deepEqual([...movesFrom("VIEWED")], [...movesFrom("SENT")]);
});

test("the end states permit nothing", () => {
  for (const status of ["DECLINED", "EXPIRED", "SUPERSEDED", "CONVERTED", "CANCELLED"] as const) {
    assert.equal(isClosed(status), true, status);
    assert.deepEqual([...movesFrom(status)], []);
  }
  assert.equal(isClosed("ACCEPTED"), false, "an accepted quotation still has an order to raise");
});

test("a live document can always be revised or cancelled", () => {
  // The escape hatch: a price that has to change, or a document raised in
  // error, must have somewhere to go from every live state.
  for (const status of ["ISSUED", "SENT", "VIEWED"] as const) {
    assert.equal(can(status, "REVISE"), true, status);
    assert.equal(can(status, "CANCEL"), true, status);
  }
});

test("a status waiting on somebody says what to do, not what it is called", () => {
  // The queue's whole purpose is the column that says whose move it is, so an
  // open status must not simply echo its own name back. A closed one may:
  // "Declined" is the right word for a declined quotation, and inventing
  // something longer would be padding.
  for (const status of QUOTATION_STATUSES) {
    const action = nextAction(status);
    assert.ok(action.length > 0, status);
    if (!isClosed(status)) {
      assert.notEqual(action.toUpperCase(), status, `${status} needs words, not its own name`);
    }
  }
});

test("a quotation lapses the day after its validity date", () => {
  const validUntil = new Date("2026-06-30T00:00:00.000Z");
  // Inclusive: a quotation valid until the 30th is good on the 30th.
  assert.equal(hasLapsed({ status: "SENT", validUntil }, new Date("2026-06-30T23:00:00Z")), false);
  assert.equal(hasLapsed({ status: "SENT", validUntil }, new Date("2026-07-01T09:00:00Z")), true);
});

test("a lapse is computed, not waited for", () => {
  // Nothing runs at midnight to sweep these, so the screen has to work it out.
  const lapsed = { status: "SENT", validUntil: new Date("2020-01-01T00:00:00Z") };
  assert.equal(effectiveStatus(lapsed), "EXPIRED");
  assert.equal(lapsed.status, "SENT", "and the stored row is not quietly rewritten");
});

test("only a live document lapses", () => {
  const old = new Date("2020-01-01T00:00:00Z");
  // An accepted quotation is an agreement and a declined one is closed.
  // Neither becomes "expired" because a date went by.
  assert.equal(hasLapsed({ status: "ACCEPTED", validUntil: old }), false);
  assert.equal(hasLapsed({ status: "DECLINED", validUntil: old }), false);
  assert.equal(hasLapsed({ status: "CONVERTED", validUntil: old }), false);
  assert.equal(hasLapsed({ status: "DRAFT", validUntil: old }), false);
});

test("no validity date means it does not lapse", () => {
  assert.equal(hasLapsed({ status: "SENT", validUntil: null }), false);
  assert.equal(effectiveStatus({ status: "SENT", validUntil: null }), "SENT");
});

test("a malformed date does not expire a live quotation", () => {
  // A quotation nobody can act on because a date failed to parse is worse than
  // one whose validity is unknown.
  assert.equal(hasLapsed({ status: "SENT", validUntil: "not a date" }), false);
});

test("a status the database does not recognise reads as a draft", () => {
  assert.equal(isQuotationStatus("PENDING"), false);
  assert.equal(effectiveStatus({ status: "PENDING", validUntil: null }), "DRAFT");
});
