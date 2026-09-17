import { test } from "node:test";
import assert from "node:assert/strict";
import { accountForReference, signerMaySettle } from "./payment-routing.ts";

/**
 * Which business a Paystack charge belongs to, and who may settle it.
 *
 * Both directions cost money. Too strict and real payments are dropped with a
 * 200 that stops Paystack retrying — the failure nobody notices until a buyer
 * asks where their bundle is. Too loose and one account's key settles the
 * other's orders unpaid.
 *
 * Run with: npm test
 */

test("bundle, AFA and registration references belong to the data business", () => {
  assert.equal(accountForReference("ND-ABC123"), "data");
  assert.equal(accountForReference("NA-ABC123"), "data");
  assert.equal(accountForReference("NR-ABC123"), "data");
  assert.equal(accountForReference("NT-ABC123"), "data");
});

test("anything else is a mall order", () => {
  assert.equal(accountForReference("NIKI-100234"), "retail");
  assert.equal(accountForReference(""), "retail");
});

test("two separate keys each settle only their own business", () => {
  assert.equal(signerMaySettle(["data"], "data"), true);
  assert.equal(signerMaySettle(["retail"], "retail"), true);
  // The whole point of the check: one account's key must not settle the
  // other's orders, which would be a way to take goods without paying.
  assert.equal(signerMaySettle(["retail"], "data"), false);
  assert.equal(signerMaySettle(["data"], "retail"), false);
});

test("one key serving both businesses settles either", () => {
  // This is the configuration until RETAIL_PAYSTACK_SECRET_KEY is set, and the
  // regression that prompted the test: recording a shared key against retail
  // alone made every bundle payment verify, get attributed to the wrong
  // business, and be dropped.
  const shared = ["retail", "data"] as const;
  assert.equal(signerMaySettle(shared, "data"), true);
  assert.equal(signerMaySettle(shared, "retail"), true);
});

test("a key that settles for nothing settles nothing", () => {
  assert.equal(signerMaySettle([], "data"), false);
  assert.equal(signerMaySettle([], "retail"), false);
});
