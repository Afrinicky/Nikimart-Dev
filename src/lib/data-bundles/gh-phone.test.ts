import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_GH_PREFIXES, checkRecipient, parseGhPhone, toStrictGhPhone } from "./gh-phone.ts";

/**
 * The gate every bundle purchase passes through.
 *
 * Each case here is a way a customer loses money: a number the provider will
 * reject, a bundle sent to the wrong network and unrecoverable, or a typo'd
 * prefix that fails only after the card has been charged.
 *
 * Run with: npm test
 */

test("a correct local number is accepted and its carrier identified", () => {
  const mtn = parseGhPhone("0241234567");
  assert.equal(mtn.ok, true);
  assert.equal(mtn.ok && mtn.local, "0241234567");
  assert.equal(mtn.ok && mtn.carrier, "MTN");

  const telecel = parseGhPhone("0501234567");
  assert.equal(telecel.ok && telecel.carrier, "TELECEL");

  const at = parseGhPhone("0271234567");
  assert.equal(at.ok && at.carrier, "AIRTELTIGO");
});

test("separators people actually type are forgiven", () => {
  assert.equal(toStrictGhPhone("024 123 4567"), "0241234567");
  assert.equal(toStrictGhPhone("024-123-4567"), "0241234567");
  assert.equal(toStrictGhPhone("  0241234567  "), "0241234567");
});

test("international form is refused, never silently converted", () => {
  // The provider rejects a +233 prefix outright, and rewriting what someone
  // typed is how a wrong number gets paid for.
  for (const input of ["+233241234567", "233241234567", "00233241234567"]) {
    const r = parseGhPhone(input);
    assert.equal(r.ok, false, `${input} should be refused`);
    assert.equal(!r.ok && r.problem, "international");
  }
  assert.equal(toStrictGhPhone("+233241234567"), null);
});

test("the 233 refusal suggests the local number it was meant to be", () => {
  const r = parseGhPhone("233241234567");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /0241234567/);
});

test("a number must be exactly ten digits", () => {
  const short = parseGhPhone("024123456");
  assert.equal(!short.ok && short.problem, "too-short");
  assert.match(!short.ok ? short.message : "", /9 digits/);

  const long = parseGhPhone("02412345678");
  assert.equal(!long.ok && long.problem, "too-long");
  assert.match(!long.ok ? long.message : "", /11 digits/);
});

test("nine-digit shorthand is no longer quietly padded to ten", () => {
  // "241234567" used to become "0241234567". A missing leading digit is just
  // as likely a dropped digit somewhere else in the number.
  assert.equal(toStrictGhPhone("241234567"), null);
});

test("a prefix belonging to no Ghanaian operator is flagged", () => {
  const r = parseGhPhone("0791234567");
  assert.equal(!r.ok && r.problem, "unknown-prefix");
  assert.match(!r.ok ? r.message : "", /079/);
  // The message lists what would work.
  assert.match(!r.ok ? r.message : "", /024/);
});

test("every network we sell has its prefixes covered", () => {
  const expected = ["020", "024", "025", "026", "027", "050", "053", "054", "055", "056", "057", "059"];
  for (const p of expected) {
    assert.ok(ALL_GH_PREFIXES.includes(p), `${p} should be a known prefix`);
  }
});

test("networks we don't sell are still recognised as real numbers", () => {
  // Knowing a line *is* valid Glo lets us say "we don't sell Glo" rather than
  // "that isn't a Ghana number".
  const glo = parseGhPhone("0231234567");
  assert.equal(glo.ok, true);
  assert.equal(glo.ok && glo.carrier, "GLO");
});

test("letters are rejected as a typo, not treated as a format", () => {
  const r = parseGhPhone("024ABC4567");
  assert.equal(!r.ok && r.problem, "not-digits");
});

test("an empty number is refused", () => {
  assert.equal(parseGhPhone("").ok, false);
  assert.equal(parseGhPhone(null).ok, false);
  assert.equal(parseGhPhone(undefined).ok, false);
});

// ---------------------------------------------------------------------------
// Matching the number to the bundle
// ---------------------------------------------------------------------------

test("a number on the bundle's own network passes", () => {
  assert.equal(checkRecipient("0241234567", "MTN", "MTN").ok, true);
  assert.equal(checkRecipient("0201234567", "TELECEL", "Telecel").ok, true);
});

test("an MTN number on a Telecel bundle is stopped, and told why", () => {
  const r = checkRecipient("0241234567", "TELECEL", "Telecel");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /MTN number/);
  assert.match(!r.ok ? r.message : "", /Telecel data/);
  assert.match(!r.ok ? r.message : "", /can't be reversed/);
});

test("both AirtelTigo products accept any AirtelTigo line", () => {
  for (const network of ["AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"]) {
    assert.equal(checkRecipient("0261234567", network, "AirtelTigo").ok, true);
    assert.equal(checkRecipient("0571234567", network, "AirtelTigo").ok, true);
  }
});

test("a Glo number is stopped on every network we sell", () => {
  const r = checkRecipient("0231234567", "MTN", "MTN");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /Glo number/);
});

test("the network check still enforces the format rules", () => {
  // A wrong-length number fails on length, not on network.
  const r = checkRecipient("+233241234567", "MTN", "MTN");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /start with 0|233/);
});
