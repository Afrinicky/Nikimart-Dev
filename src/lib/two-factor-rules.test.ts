import { test } from "node:test";
import assert from "node:assert/strict";
import { channelHint, isChannel, usableChannel } from "./two-factor-rules.ts";

/**
 * The pure half of the second step: which channel an account can be reached
 * on, and how that is said back to them. The code handling itself needs a
 * database and is exercised by the sign-in flow.
 */

const withBoth = { id: "u1", name: "Ama", email: "ama@example.com", phone: "0241234567" };
const emailOnly = { id: "u2", name: "Kofi", email: "kofi@example.com", phone: null };
const phoneOnly = { id: "u3", name: "Esi", email: "", phone: "0209876543" };

test("only the two real channels are channels", () => {
  assert.equal(isChannel("email"), true);
  assert.equal(isChannel("sms"), true);
  assert.equal(isChannel("whatsapp"), false);
  assert.equal(isChannel(""), false);
  assert.equal(isChannel(undefined), false);
});

test("text messages are only offered to an account with a number", () => {
  assert.equal(usableChannel(withBoth, "sms"), "sms");
  // Asking for SMS without a number would send the code nowhere and lock them
  // out on the next sign-in.
  assert.equal(usableChannel(emailOnly, "sms"), "email");
});

test("an account with no email falls back to its phone", () => {
  assert.equal(usableChannel(phoneOnly, "email"), "sms");
  assert.equal(usableChannel(emailOnly, "email"), "email");
  assert.equal(usableChannel(withBoth, null), "email");
});

test("the hint confirms the address without printing it", () => {
  const email = channelHint(withBoth, "email");
  assert.equal(email, "am•••@example.com");
  assert.ok(!email.includes("ama@"), "the local part is not given in full");

  assert.equal(channelHint(withBoth, "sms"), "the number ending 4567");
});

test("the hint still says something when there is nothing to mask", () => {
  assert.equal(channelHint(phoneOnly, "email"), "your email");
  assert.equal(channelHint(emailOnly, "sms"), "your phone");
});
