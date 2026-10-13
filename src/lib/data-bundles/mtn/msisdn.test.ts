import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMtnMsisdn, normaliseMsisdnFormat, sameSubscriber, toMtnMsisdn } from "./msisdn.ts";

/**
 * The number a transfer is credited to.
 *
 * Getting this wrong does not fail loudly — it credits a real subscriber who
 * is not the buyer, and MTN cannot reverse it. The two formats in play look
 * similar enough to swap by accident, which is the whole reason for these.
 *
 * Run with: npm test
 */

test("a Ghana number becomes an international MSISDN, however it was typed", () => {
  assert.equal(toMtnMsisdn("0241234567"), "233241234567");
  assert.equal(toMtnMsisdn("+233241234567"), "233241234567");
  assert.equal(toMtnMsisdn("233241234567"), "233241234567");
  assert.equal(toMtnMsisdn("241234567"), "233241234567");
  assert.equal(toMtnMsisdn("024 123 4567"), "233241234567");
});

test("an account provisioned for the local form gets the local form", () => {
  assert.equal(toMtnMsisdn("0241234567", "LOCAL"), "0241234567");
  assert.equal(toMtnMsisdn("+233241234567", "LOCAL"), "0241234567");
  assert.equal(toMtnMsisdn("233241234567", "LOCAL"), "0241234567");
});

test("anything that cannot be a Ghana mobile number is refused, not guessed at", () => {
  assert.equal(toMtnMsisdn(""), null);
  assert.equal(toMtnMsisdn(null), null);
  assert.equal(toMtnMsisdn(undefined), null);
  assert.equal(toMtnMsisdn("02412345"), null); // too short
  assert.equal(toMtnMsisdn("02412345678"), null); // too long
  assert.equal(toMtnMsisdn("not a phone"), null);
});

test("an MSISDN MTN hands back converts to the local form we store", () => {
  assert.equal(fromMtnMsisdn("233241234567"), "0241234567");
  assert.equal(fromMtnMsisdn("0241234567"), "0241234567");
  assert.equal(fromMtnMsisdn("rubbish"), null);
});

test("the same subscriber is the same subscriber in either format", () => {
  assert.equal(sameSubscriber("233241234567", "0241234567"), true);
  assert.equal(sameSubscriber("+233241234567", "241234567"), true);
  assert.equal(sameSubscriber("0241234567", "0241234568"), false);
  // Two numbers that cannot be read are not thereby "the same".
  assert.equal(sameSubscriber("rubbish", "rubbish"), false);
  assert.equal(sameSubscriber(null, null), false);
});

test("an unreadable stored format falls back to international, never to nothing", () => {
  assert.equal(normaliseMsisdnFormat("LOCAL"), "LOCAL");
  assert.equal(normaliseMsisdnFormat("local"), "LOCAL");
  assert.equal(normaliseMsisdnFormat("INTERNATIONAL"), "INTERNATIONAL");
  assert.equal(normaliseMsisdnFormat(""), "INTERNATIONAL");
  assert.equal(normaliseMsisdnFormat(null), "INTERNATIONAL");
  assert.equal(normaliseMsisdnFormat("nonsense"), "INTERNATIONAL");
});
