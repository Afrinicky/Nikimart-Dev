import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRoute, mtnTransactionId, normaliseRoute } from "./route-rules.ts";

/**
 * The decision that moves a live order onto a different provider.
 *
 * The one thing these must prove is that the new route cannot capture an
 * order by accident: every doubt — switched off, half-configured, unmapped
 * size, wrong network — has to come back as the provider that has always
 * delivered.
 *
 * Run with: npm test
 */

const READY = {
  network: "MTN",
  sizeGb: 5,
  mtnRouteEnabled: true,
  mtnReady: true,
  productCode: "CODE_5",
};

test("a fully configured, switched-on MTN bundle goes to MTN", () => {
  const decision = decideRoute(READY);
  assert.equal(decision.route, "MTN");
  assert.equal(decision.productCode, "CODE_5");
});

test("the switch off means the existing provider, whatever else is set", () => {
  const decision = decideRoute({ ...READY, mtnRouteEnabled: false });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /switched off/i);
});

test("switched on but half-configured still delivers, through the old route", () => {
  const decision = decideRoute({ ...READY, mtnReady: false });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /not fully configured/i);
});

test("an unmapped size is never guessed at — it takes the old route", () => {
  const decision = decideRoute({ ...READY, sizeGb: 40, productCode: null });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /40GB/);
});

test("the other networks are never sent to MTN's transfer API", () => {
  for (const network of ["TELECEL", "AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"]) {
    const decision = decideRoute({ ...READY, network });
    assert.equal(decision.route, "JUSTICE", network);
  }
});

test("an order placed before any of this existed reads as the old route", () => {
  assert.equal(normaliseRoute(null), "JUSTICE");
  assert.equal(normaliseRoute(undefined), "JUSTICE");
  assert.equal(normaliseRoute(""), "JUSTICE");
  assert.equal(normaliseRoute("nonsense"), "JUSTICE");
  assert.equal(normaliseRoute("MTN"), "MTN");
  assert.equal(normaliseRoute("JUSTICE"), "JUSTICE");
});

test("one attempt always presents the same transaction id", () => {
  assert.equal(mtnTransactionId("ND-ABC123"), mtnTransactionId("ND-ABC123"));
  assert.equal(mtnTransactionId("ND-ABC123"), "NDABC123");
});

test("the id is alphanumeric and short enough for somebody else's platform", () => {
  const id = mtnTransactionId("ND-LONG-REFERENCE-WITH-LOTS-OF-PUNCTUATION-123456789");
  assert.match(id, /^[A-Z0-9]+$/);
  assert.ok(id.length <= 24, `${id} is ${id.length} characters`);
});

test("a re-order gets a fresh id, so it cannot collide with the failed attempt", () => {
  const first = mtnTransactionId("ND-ABC123");
  const retry = mtnTransactionId("ND-ABC123", new Date("2026-10-13T12:00:00Z"));
  const laterRetry = mtnTransactionId("ND-ABC123", new Date("2026-10-13T13:00:00Z"));

  assert.notEqual(retry, first);
  assert.notEqual(laterRetry, retry);
  // …and each retry's own id is stable, so the retry itself is still idempotent.
  assert.equal(retry, mtnTransactionId("ND-ABC123", new Date("2026-10-13T12:00:00Z")));
  assert.match(retry, /^[A-Z0-9]+$/);
});
