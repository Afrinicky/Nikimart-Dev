import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "test-secret-for-callback-tokens";
const { callbackToken, callbackTokenMatches } = await import("./callback-token.ts");

/**
 * The provider's callback is the only unauthenticated way an order's status can
 * change, so the token guarding it has to be exactly as narrow as it claims:
 * valid for its own reference and nothing else.
 *
 * Run with: npm test
 */

test("a reference's token validates for that reference", () => {
  const token = callbackToken("ND-ABC123");
  assert.ok(token);
  assert.ok(callbackTokenMatches("ND-ABC123", token));
});

test("a token is useless against any other order", () => {
  const token = callbackToken("ND-ABC123")!;
  // The whole point of deriving per reference: leaking one callback URL must
  // not hand over the ability to close somebody else's order.
  assert.equal(callbackTokenMatches("ND-XYZ789", token), false);
});

test("a wrong, empty, or truncated token is rejected", () => {
  const token = callbackToken("ND-ABC123")!;
  assert.equal(callbackTokenMatches("ND-ABC123", ""), false);
  assert.equal(callbackTokenMatches("ND-ABC123", "not-a-token"), false);
  assert.equal(callbackTokenMatches("ND-ABC123", token.slice(0, -1)), false);
});

test("tokens are stable, so a callback still validates days later", () => {
  assert.equal(callbackToken("ND-ABC123"), callbackToken("ND-ABC123"));
});
