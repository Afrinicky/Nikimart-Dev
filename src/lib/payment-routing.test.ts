import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  accountForReference,
  accountSplit,
  selectSigner,
  signerMaySettle,
  type PaymentAccount,
} from "./payment-routing.ts";

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

test("accountSplit: nothing configured when the mall has no key at all", () => {
  assert.equal(accountSplit(undefined, undefined), "unconfigured");
  assert.equal(accountSplit("", "sk_data"), "unconfigured");
});

test("accountSplit: shared when one key serves both businesses", () => {
  assert.equal(accountSplit("sk_same", "sk_same"), "shared");
});

test("accountSplit: separate once the mall has its own key", () => {
  assert.equal(accountSplit("sk_retail", "sk_data"), "separate");
});

test("accountSplit: the mall alone still counts as separate", () => {
  assert.equal(accountSplit("sk_retail", undefined), "separate");
});

// selectSigner is the step that changes behaviour the day a second Paystack
// account is added, and a mistake there drops a real payment with a 200 that
// stops Paystack retrying. These sign the body the way Paystack does, so the
// two-key case is covered before there are two keys taking money.
function sign(raw: string, secret: string): string {
  return createHmac("sha512", secret).update(raw).digest("hex");
}

const BODY = JSON.stringify({ event: "charge.success", data: { reference: "ND-ABC123" } });
const TWO_KEYS = [
  { secret: "sk_retail", accounts: ["retail"] as PaymentAccount[] },
  { secret: "sk_data", accounts: ["data"] as PaymentAccount[] },
];

test("selectSigner: each of two keys is recognised as only its own business", () => {
  assert.deepEqual(selectSigner(BODY, sign(BODY, "sk_retail"), TWO_KEYS), ["retail"]);
  assert.deepEqual(selectSigner(BODY, sign(BODY, "sk_data"), TWO_KEYS), ["data"]);
});

test("selectSigner: a key serving both businesses is recognised as both", () => {
  const shared = [{ secret: "sk_both", accounts: ["retail", "data"] as PaymentAccount[] }];
  assert.deepEqual(selectSigner(BODY, sign(BODY, "sk_both"), shared), ["retail", "data"]);
});

test("selectSigner: an unknown key, a wrong body and an empty signature all fail", () => {
  assert.equal(selectSigner(BODY, sign(BODY, "sk_someone_else"), TWO_KEYS), null);
  assert.equal(selectSigner(BODY, sign("tampered", "sk_retail"), TWO_KEYS), null);
  assert.equal(selectSigner(BODY, "", TWO_KEYS), null);
  assert.equal(selectSigner(BODY, sign(BODY, "sk_retail"), []), null);
});

// The pair that matters: a bundle reference signed by the bundle key settles,
// and the same reference signed by the mall's key does not.
test("selectSigner and signerMaySettle together keep the two accounts apart", () => {
  const dataSigned = selectSigner(BODY, sign(BODY, "sk_data"), TWO_KEYS);
  const retailSigned = selectSigner(BODY, sign(BODY, "sk_retail"), TWO_KEYS);
  const belongsTo = accountForReference("ND-ABC123");
  assert.equal(belongsTo, "data");
  assert.equal(signerMaySettle(dataSigned!, belongsTo), true);
  assert.equal(signerMaySettle(retailSigned!, belongsTo), false);
});
