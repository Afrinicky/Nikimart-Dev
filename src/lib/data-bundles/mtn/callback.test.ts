import { test } from "node:test";
import assert from "node:assert/strict";
import { readCallback } from "./callback.ts";

/**
 * What arrives at the MTN callback URL.
 *
 * The expensive confusion is consent-approved versus delivered. Approval means
 * the transfer may now begin; treating it as delivery pays commission on data
 * that has not moved and — completion being sticky — stops anything checking
 * again. These pin that apart.
 *
 * Run with: npm test
 */

test("a completed transfer callback completes the order", () => {
  const reading = readCallback({ statusCode: "0000", data: { transactionState: "SUCCESS" } });
  assert.equal(reading.kind, "transfer");
  assert.equal(reading.status, "completed");
  assert.equal(reading.providerStatus, "SUCCESS");
});

test("a flat transactionState is read the same as a nested one", () => {
  const reading = readCallback({ statusCode: "0000", transactionState: "SUCCESS" });
  assert.equal(reading.kind, "transfer");
  assert.equal(reading.status, "completed");
});

test("a failed transfer callback fails the order", () => {
  const reading = readCallback({ statusCode: "0000", data: { transactionState: "FAILED" } });
  assert.equal(reading.status, "failed");
});

test("consent granted is NOT delivery — the order stays in flight", () => {
  const reading = readCallback({ statusCode: "0000", msisdn: "233241234567", userResponse: "APPROVED" });
  assert.equal(reading.kind, "consent");
  assert.equal(reading.status, "processing");
  assert.match(reading.message, /waiting for the transfer/i);
});

test("consent refused ends the order", () => {
  for (const answer of ["DECLINED", "rejected", "NO", "TIMEOUT"]) {
    const reading = readCallback({ userResponse: answer });
    assert.equal(reading.kind, "consent");
    assert.equal(reading.status, "failed", answer);
  }
});

test("a consent answer nobody recognises changes nothing", () => {
  const reading = readCallback({ userResponse: "MAYBE_LATER" });
  assert.equal(reading.kind, "consent");
  assert.equal(reading.status, null);
  assert.match(reading.message, /not understood/i);
});

test("a body with no status at all changes nothing", () => {
  assert.equal(readCallback({}).status, null);
  assert.equal(readCallback(null).status, null);
  assert.equal(readCallback(undefined).status, null);
  assert.equal(readCallback({ sequenceNo: "1" }).kind, "unknown");
});
