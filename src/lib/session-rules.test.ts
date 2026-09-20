import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionAccepted, sessionVerdict } from "./session-rules.ts";

/**
 * The rule that stops two people holding one account. Everything that is not
 * an exact match has to be refused, so each way of not matching is named.
 */

test("the token the account currently holds is the one that works", () => {
  assert.equal(sessionVerdict("abc", "abc"), "current");
  assert.equal(sessionAccepted("current"), true);
});

test("a second sign-in supersedes the first", () => {
  // The whole bug: two tokens, both signed by us, both previously accepted.
  assert.equal(sessionVerdict("first", "second"), "superseded");
  assert.equal(sessionAccepted("superseded"), false);
});

test("signing out everywhere refuses every token, including the current one", () => {
  assert.equal(sessionVerdict("abc", null), "signed-out");
  assert.equal(sessionVerdict("abc", undefined), "signed-out");
  assert.equal(sessionAccepted("signed-out"), false);
});

test("a token from before this existed is refused rather than trusted", () => {
  // Trusting these would leave every already-issued duplicate working.
  assert.equal(sessionVerdict(null, "abc"), "legacy");
  assert.equal(sessionVerdict(undefined, "abc"), "legacy");
  assert.equal(sessionVerdict("", "abc"), "legacy");
  assert.equal(sessionVerdict(null, null), "legacy");
  assert.equal(sessionAccepted("legacy"), false);
});

test("an empty account id is not a wildcard", () => {
  assert.equal(sessionAccepted(sessionVerdict("abc", "")), false);
  assert.equal(sessionAccepted(sessionVerdict("", "")), false);
});
