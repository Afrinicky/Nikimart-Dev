import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChannel, sessionIdFromChannel } from "./channels.ts";

/**
 * The channel name is built in the browser and checked on the server, so the
 * two spellings have to be one spelling. A token minted for a name the client
 * does not use grants nothing; a name the server cannot tie back to an owner
 * is a room anybody could join.
 */

test("a session's channel round-trips to its id", () => {
  const id = "ckt12345abcdef";
  assert.equal(sessionChannel(id), "nikimart:session:ckt12345abcdef");
  assert.equal(sessionIdFromChannel(sessionChannel(id)), id);
});

test("surrounding whitespace is not a different channel", () => {
  assert.equal(sessionIdFromChannel("  nikimart:session:abc123  "), "abc123");
});

test("anything that is not one of our session channels is refused", () => {
  for (const bad of [
    "",
    "nikimart:session:",
    "session:abc",
    "nikimart:team:abc",
    // A wildcard is how one token would become a token for every room.
    "nikimart:session:*",
    "nikimart:session:abc:def",
    "*",
    "nikimart:session:abc def",
  ]) {
    assert.equal(sessionIdFromChannel(bad), null, `refused: ${JSON.stringify(bad)}`);
  }
});
