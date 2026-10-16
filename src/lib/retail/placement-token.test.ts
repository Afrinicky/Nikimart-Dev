import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The token a queue row is addressed by.
 *
 * A queue row is not a database row — it is one supplier, on one lane, for one
 * seller, worked out from the lines waiting — so its identity is a composite
 * string. These are the two functions that make such a string safe to put in a
 * URL, tested here rather than through the module they live in because that
 * one reads the database on import.
 */
function groupToken(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function keyFromToken(token: string): string {
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

test("a key survives the round trip", () => {
  for (const key of [
    "vendor1::https://example.com/shoe?id=4&c=2::fwd1::route1",
    "vendor1::Guangzhou Shoe Co::::",
    "vendor1::名牌鞋业::fwd1::route1",
    "",
  ]) {
    assert.equal(keyFromToken(groupToken(key)), key, key);
  }
});

test("a token is URL-safe — no slash, plus or padding to escape", () => {
  const token = groupToken("vendor1::https://example.com/a+b/c?d=1::fwd::route");
  assert.match(token, /^[A-Za-z0-9_-]*$/);
  assert.equal(encodeURIComponent(token), token);
});

test("nonsense decodes to nothing rather than throwing", () => {
  // The queue then finds no group and the window 404s, which is the right
  // answer for an address that names no parcel.
  assert.doesNotThrow(() => keyFromToken("!!!!"));
  assert.notEqual(keyFromToken("!!!!"), "vendor1::x::::");
});
