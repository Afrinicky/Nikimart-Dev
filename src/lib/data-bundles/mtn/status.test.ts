import { test } from "node:test";
import assert from "node:assert/strict";
import { isAcceptedStatusCode, mapMtnStatus, mtnMessage, mtnValueCharged } from "./status.ts";

/**
 * Reading MTN's reply.
 *
 * The expensive mistake is in one direction: completion is sticky, so an order
 * wrongly read as delivered pays commission and is never looked at again. The
 * tests below pin that bias — anything unclear stays in flight.
 *
 * Run with: npm test
 */

test("a delivered transfer is delivered", () => {
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "SUCCESS" }), "completed");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "SUCCESSFUL" }), "completed");
  assert.equal(mapMtnStatus({ statusCode: "200", transactionState: "COMPLETED" }), "completed");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "delivered" }), "completed");
});

test("a failed transfer is failed, even under an accepted status code", () => {
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "FAILED" }), "failed");
  assert.equal(mapMtnStatus({ statusCode: "200", transactionState: "REJECTED" }), "failed");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "TIMED OUT" }), "failed");
});

test("a rejected request is failed — there is no transfer to wait for", () => {
  assert.equal(mapMtnStatus({ statusCode: "401", transactionState: null }), "failed");
  assert.equal(mapMtnStatus({ statusCode: "500", transactionState: "PENDING" }), "failed");
  assert.equal(mapMtnStatus({ statusCode: "", transactionState: "" }), "failed");
});

test("waiting on a subscriber's consent is queued, not processing", () => {
  // It is sitting still waiting for somebody to tap a prompt — the same state
  // as accepted-but-not-started, and the one an order can still be pulled from.
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "AWAITING_CONSENT" }), "queued");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "pending consent" }), "queued");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "QUEUED" }), "queued");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "ACCEPTED" }), "queued");
});

test("accepted but unclear stays in flight rather than being called delivered", () => {
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "PENDING" }), "processing");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "IN_PROGRESS" }), "processing");
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: null }), "processing");
  // A state nobody has taught this function about is never a success.
  assert.equal(mapMtnStatus({ statusCode: "0000", transactionState: "SOMETHING_NEW" }), "processing");
});

test("status codes: the accepted set and the 2xx family, nothing else", () => {
  assert.equal(isAcceptedStatusCode("0000"), true);
  assert.equal(isAcceptedStatusCode("0"), true);
  assert.equal(isAcceptedStatusCode("200"), true);
  assert.equal(isAcceptedStatusCode("201"), true);
  assert.equal(isAcceptedStatusCode("400"), false);
  assert.equal(isAcceptedStatusCode("503"), false);
  assert.equal(isAcceptedStatusCode(""), false);
  assert.equal(isAcceptedStatusCode(null), false);
});

test("the admin's message keeps every part MTN sent, in one line", () => {
  const message = mtnMessage({
    statusCode: "0000",
    statusMessage: "Transfer successful",
    supportMessage: "TXN_OK",
    downstreamStatusCode: 0,
    transactionState: "SUCCESS",
  });
  assert.match(message, /Transfer successful/);
  assert.match(message, /state SUCCESS/);
  assert.match(message, /code 0000/);
  assert.match(message, /TXN_OK/);
  assert.match(message, /downstream 0/);
  assert.ok(message.length <= 500);
});

test("an empty reply still reads as something rather than as nothing", () => {
  assert.equal(mtnMessage({}), "No message from MTN.");
});

test("a cost is only taken from a unit that is actually money", () => {
  assert.equal(mtnValueCharged(5, "GHS"), 5);
  assert.equal(mtnValueCharged("12.5", "GHC"), 12.5);
  assert.equal(mtnValueCharged(650, "PESEWAS"), 6.5);
  // Volume is not a price. Reading "5000 MB" as GH₵5000 would make every MTN
  // sale on the margin report a catastrophic loss.
  assert.equal(mtnValueCharged(5000, "MB"), null);
  assert.equal(mtnValueCharged(5, "GB"), null);
  assert.equal(mtnValueCharged(5, null), null);
  assert.equal(mtnValueCharged("not a number", "GHS"), null);
  assert.equal(mtnValueCharged(-1, "GHS"), null);
});
