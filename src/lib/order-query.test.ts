import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOrderQuery } from "./order-query.ts";

/**
 * Which of the two order tables a tracking query belongs to.
 *
 * The bug this replaces: the public tracker searched a hardcoded array of four
 * demo orders, so a customer who had actually bought something — a bundle or a
 * marketplace order — was told no such purchase existed. Routing the query is
 * the first thing that has to be right, so it is pinned here.
 */

test("a data reference goes to the bundle tracker", () => {
  assert.deepEqual(classifyOrderQuery("ND-ABC123"), { kind: "data", query: "ND-ABC123" });
  // People paste out of an SMS, in whatever case it arrived.
  assert.deepEqual(classifyOrderQuery("  nd-abc123 "), { kind: "data", query: "ND-ABC123" });
});

test("an AFA registration reference goes there too", () => {
  assert.deepEqual(classifyOrderQuery("NA-XYZ789"), { kind: "data", query: "NA-XYZ789" });
  assert.deepEqual(classifyOrderQuery("na-xyz789"), { kind: "data", query: "NA-XYZ789" });
});

test("a Ghana phone number is a bundle query", () => {
  // Bundles are bought without an account, so the number paid with is the key.
  // Marketplace orders belong to an account, never to a bare phone number.
  for (const input of ["0244123456", "+233244123456", "233244123456", "244123456", "024 412 3456"]) {
    assert.deepEqual(
      classifyOrderQuery(input),
      { kind: "data", query: input.trim() },
      `expected ${input} to route to the bundle tracker`,
    );
  }
});

test("anything else is a marketplace order number", () => {
  assert.deepEqual(classifyOrderQuery("NM-M8K2P1X447"), {
    kind: "marketplace",
    orderNumber: "NM-M8K2P1X447",
  });
  // Uppercased, because that is how they are stored and how people paste them.
  assert.deepEqual(classifyOrderQuery("nm-m8k2p1x447"), {
    kind: "marketplace",
    orderNumber: "NM-M8K2P1X447",
  });
});

test("nothing usable is not a search", () => {
  for (const input of [undefined, null, "", "   ", "NM", "abc"]) {
    assert.deepEqual(
      classifyOrderQuery(input),
      { kind: "empty" },
      `expected ${JSON.stringify(input)} to be empty`,
    );
  }
});

test("a reference prefix wins over anything that looks phone-ish", () => {
  // A reference is unambiguous; a digit run is not. Order of the checks matters.
  assert.equal(classifyOrderQuery("ND-0244123456").kind, "data");
  assert.deepEqual(classifyOrderQuery("ND-0244123456"), {
    kind: "data",
    query: "ND-0244123456",
  });
});

test("a number that is not a Ghana mobile is treated as an order number", () => {
  // Eight digits is neither a local number nor an international one, so there
  // is nothing to gain by sending it to the bundle tracker.
  assert.equal(classifyOrderQuery("12345678").kind, "marketplace");
});
