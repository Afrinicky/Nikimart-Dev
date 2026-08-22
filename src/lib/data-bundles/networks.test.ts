import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapProviderStatus,
  networkForPhone,
  phoneMatchesNetwork,
  toLocalGhPhone,
} from "./networks.ts";

/**
 * The rules that decide where a bundle actually lands.
 *
 * Two of them cost real money when they're wrong: the provider rejects a number
 * carrying a +233/233 prefix, and data credited to the wrong network can't be
 * reversed. Both are easy to erode by accident, hence these.
 *
 * Run with: npm test
 */

test("phone numbers are normalised to the local form the provider expects", () => {
  assert.equal(toLocalGhPhone("0241234567"), "0241234567");
  assert.equal(toLocalGhPhone("+233241234567"), "0241234567");
  assert.equal(toLocalGhPhone("233241234567"), "0241234567");
  assert.equal(toLocalGhPhone("241234567"), "0241234567");
  assert.equal(toLocalGhPhone("024 123 4567"), "0241234567");
});

test("anything that can't be a Ghana mobile number is rejected outright", () => {
  assert.equal(toLocalGhPhone(""), null);
  assert.equal(toLocalGhPhone("02412345"), null); // too short
  assert.equal(toLocalGhPhone("02412345678"), null); // too long
  assert.equal(toLocalGhPhone("+447700900000"), null); // not Ghana
  assert.equal(toLocalGhPhone(null), null);
});

test("a number is matched to the network that owns its prefix", () => {
  assert.equal(networkForPhone("0241234567"), "MTN");
  assert.equal(networkForPhone("0591234567"), "MTN");
  assert.equal(networkForPhone("0201234567"), "TELECEL");
  assert.equal(networkForPhone("0501234567"), "TELECEL");
  assert.equal(networkForPhone("0271234567"), "AIRTELTIGO_ISHARE");
  assert.equal(networkForPhone("0301234567"), null); // landline prefix
});

test("iShare and BigTime both accept any AirtelTigo number", () => {
  assert.ok(phoneMatchesNetwork("0271234567", "AIRTELTIGO_ISHARE"));
  assert.ok(phoneMatchesNetwork("0271234567", "AIRTELTIGO_BIGTIME"));
  assert.ok(phoneMatchesNetwork("0561234567", "AIRTELTIGO_BIGTIME"));
});

test("a bundle can't be sent to a number on another network", () => {
  assert.equal(phoneMatchesNetwork("0241234567", "TELECEL"), false);
  assert.equal(phoneMatchesNetwork("0201234567", "MTN"), false);
  assert.equal(phoneMatchesNetwork("0241234567", "AIRTELTIGO_ISHARE"), false);
});

test("provider statuses map onto ours, and unknown ones stay in flight", () => {
  assert.equal(mapProviderStatus("COMPLETED"), "completed");
  assert.equal(mapProviderStatus("successful"), "completed");
  assert.equal(mapProviderStatus("FAILED"), "failed");
  assert.equal(mapProviderStatus("CANCELLED"), "failed");
  assert.equal(mapProviderStatus("PENDING"), "processing");
  // An unrecognised status must never read as delivered — that would stop us
  // chasing an order the buyer never received.
  assert.equal(mapProviderStatus("SOMETHING_NEW"), "processing");
  assert.equal(mapProviderStatus(null), "processing");
});
