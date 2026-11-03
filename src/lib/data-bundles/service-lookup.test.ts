import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, maskPhone, readLookup } from "./service-lookup.ts";

/**
 * The one box somebody types into when they come back.
 *
 * Everything here is a real way people hold the thing they were given: a code
 * off a screenshot in lower case, a number out of a call log with the country
 * code on it, a reference with a space in it. Getting one wrong means telling
 * a customer their own phone number is not a phone number, which is where
 * they stop. Run with: npm test
 */

test("a code is recognised however it was written down", () => {
  assert.deepEqual(readLookup("SV-7K3P9D"), { kind: "code", value: "SV-7K3P9D" });
  assert.deepEqual(readLookup("sv-7k3p9d"), { kind: "code", value: "SV-7K3P9D" });
  assert.deepEqual(readLookup("  SV-7K3P9D "), { kind: "code", value: "SV-7K3P9D" });
  // The prefix left off, which is what somebody reading it aloud leaves off.
  assert.deepEqual(readLookup("7K3P9D"), { kind: "code", value: "SV-7K3P9D" });
});

test("a reference is a reference, not a code", () => {
  assert.deepEqual(readLookup("NS-M4K2P9731"), { kind: "reference", value: "NS-M4K2P9731" });
  assert.deepEqual(readLookup("ns-m4k2p9731"), { kind: "reference", value: "NS-M4K2P9731" });
});

test("a phone number is read the way it was copied", () => {
  assert.deepEqual(readLookup("0248332322"), { kind: "phone", value: "0248332322" });
  assert.deepEqual(readLookup("+233248332322"), { kind: "phone", value: "0248332322" });
  assert.deepEqual(readLookup("024 833 2322"), { kind: "phone", value: "0248332322" });
  // Digits must never be mistaken for a code.
  assert.equal(readLookup("233248").kind !== "code", true);
});

test("an email is matched before anything else", () => {
  assert.deepEqual(readLookup("Rex@Example.com"), { kind: "email", value: "rex@example.com" });
  assert.equal(readLookup("not-an-email@").kind, "unknown");
});

test("an empty or unreadable box asks rather than guesses", () => {
  assert.equal(readLookup("").kind, "unknown");
  assert.equal(readLookup("   ").kind, "unknown");
  assert.equal(readLookup("what was it again").kind, "unknown");
});

test("identifiers are shown masked, so a list cannot be harvested", () => {
  assert.equal(maskPhone("0248332322"), "024••••322");
  assert.equal(maskPhone("024"), "024");
  assert.equal(maskEmail("rexsales@gmail.com"), "r••••@gmail.com");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});
