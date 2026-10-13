import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carrierTransactionId,
  decideRoute,
  normaliseRoute,
  type CarrierSummary,
} from "./rules.ts";

/**
 * The decision that moves a live order onto a different provider.
 *
 * The one thing these must prove is that a direct carrier route cannot
 * capture an order by accident: every doubt — no carrier for the network,
 * switched off, half-configured, unmapped size — has to come back as the
 * reseller that has always delivered.
 *
 * Run with: npm test
 */

const MTN: CarrierSummary = {
  id: "MTN",
  label: "MTN Customer Data Transfer",
  networks: ["MTN"],
  ready: true,
  missing: [],
  usesProductCodes: true,
};

const READY = {
  network: "MTN",
  sizeGb: 5,
  carrier: MTN,
  routeSetting: "MTN",
  productCode: "CODE_5",
};

test("a fully configured, switched-on bundle goes to its carrier", () => {
  const decision = decideRoute(READY);
  assert.equal(decision.route, "MTN");
  assert.equal(decision.productCode, "CODE_5");
});

test("the switch off means the reseller, whatever else is set", () => {
  const decision = decideRoute({ ...READY, routeSetting: "JUSTICE" });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /switched off/i);
});

test("switched on but half-configured still delivers, through the reseller", () => {
  const decision = decideRoute({
    ...READY,
    carrier: { ...MTN, ready: false, missing: ["MTN_TARGET_SYSTEM"] },
  });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /not fully configured/i);
});

test("an unmapped size is never guessed at — it takes the reseller", () => {
  const decision = decideRoute({ ...READY, sizeGb: 40, productCode: null });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /40GB/);
});

test("a network no carrier covers yet takes the reseller, and says so", () => {
  // This is Telecel and AirtelTigo today: the switch has nothing to point at.
  const decision = decideRoute({
    network: "TELECEL",
    sizeGb: 15,
    carrier: null,
    routeSetting: "TELECEL",
    productCode: null,
  });
  assert.equal(decision.route, "JUSTICE");
  assert.match(decision.reason, /no direct carrier api/i);
});

test("a carrier that takes a volume is not blocked for want of a product code", () => {
  // Not every carrier addresses a bundle by code. One that does not must route
  // on an empty mapping rather than waiting forever for codes it never needs.
  const decision = decideRoute({
    network: "TELECEL",
    sizeGb: 15,
    carrier: {
      id: "TELECEL",
      label: "Telecel Direct",
      networks: ["TELECEL"],
      ready: true,
      missing: [],
      usesProductCodes: false,
    },
    routeSetting: "TELECEL",
    productCode: null,
  });
  assert.equal(decision.route, "TELECEL");
});

test("one carrier can cover several networks", () => {
  // AirtelTigo sells iShare and BigTime through one account.
  const airtelTigo: CarrierSummary = {
    id: "AIRTELTIGO",
    label: "AirtelTigo Direct",
    networks: ["AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"],
    ready: true,
    missing: [],
    usesProductCodes: true,
  };
  for (const network of ["AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"]) {
    const decision = decideRoute({
      network,
      sizeGb: 25,
      carrier: airtelTigo,
      routeSetting: "AIRTELTIGO",
      productCode: "AT_25",
    });
    assert.equal(decision.route, "AIRTELTIGO", network);
  }
});

test("an order placed before any of this existed reads as the reseller", () => {
  assert.equal(normaliseRoute(null), "JUSTICE");
  assert.equal(normaliseRoute(undefined), "JUSTICE");
  assert.equal(normaliseRoute(""), "JUSTICE");
  assert.equal(normaliseRoute("nonsense"), "JUSTICE");
  assert.equal(normaliseRoute("MTN"), "MTN");
  assert.equal(normaliseRoute("TELECEL"), "TELECEL");
  assert.equal(normaliseRoute("AIRTELTIGO"), "AIRTELTIGO");
  assert.equal(normaliseRoute("JUSTICE"), "JUSTICE");
});

test("one attempt always presents the same transaction id", () => {
  assert.equal(carrierTransactionId("ND-ABC123"), carrierTransactionId("ND-ABC123"));
  assert.equal(carrierTransactionId("ND-ABC123"), "NDABC123");
});

test("the id is alphanumeric and short enough for somebody else's platform", () => {
  const id = carrierTransactionId("ND-LONG-REFERENCE-WITH-LOTS-OF-PUNCTUATION-123456789");
  assert.match(id, /^[A-Z0-9]+$/);
  assert.ok(id.length <= 24, `${id} is ${id.length} characters`);
});

test("a re-order gets a fresh id, so it cannot collide with the failed attempt", () => {
  const first = carrierTransactionId("ND-ABC123");
  const retry = carrierTransactionId("ND-ABC123", new Date("2026-10-13T12:00:00Z"));
  const laterRetry = carrierTransactionId("ND-ABC123", new Date("2026-10-13T13:00:00Z"));

  assert.notEqual(retry, first);
  assert.notEqual(laterRetry, retry);
  // …and each retry's own id is stable, so the retry itself is still idempotent.
  assert.equal(retry, carrierTransactionId("ND-ABC123", new Date("2026-10-13T12:00:00Z")));
  assert.match(retry, /^[A-Z0-9]+$/);
});
