import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackTitle,
  isAdmin,
  needsRequestToJoin,
  parseParticipant,
  participantKey,
} from "./identity.ts";

/**
 * A participant string is built in one place and checked in another — it gates
 * whether somebody is in a room. A parser that accepted something it should
 * not is a room somebody walks into.
 */

test("a participant round-trips", () => {
  assert.equal(participantKey("AGENT", "ckt123"), "AGENT:ckt123");
  assert.deepEqual(parseParticipant("AGENT:ckt123"), { kind: "AGENT", id: "ckt123" });
  assert.deepEqual(parseParticipant("ADMIN:usr_9"), { kind: "ADMIN", id: "usr_9" });
});

test("ids are trimmed when built, so one person is one participant", () => {
  assert.equal(participantKey("AGENT", "  ckt123  "), "AGENT:ckt123");
});

test("anything that is not one of ours is refused", () => {
  for (const bad of [
    "",
    "AGENT",
    "AGENT:",
    ":ckt123",
    "agent:ckt123",
    "OWNER:ckt123",
    // A colon in the id would let one participant impersonate another kind.
    "AGENT:ADMIN:1",
    // Anything that is not an id shape.
    "AGENT:has space",
    "AGENT:has/slash",
    `AGENT:${"x".repeat(65)}`,
    null,
    undefined,
  ]) {
    assert.equal(parseParticipant(bad), null, `refused: ${JSON.stringify(bad)}`);
  }
});

test("only an admin reads as an admin", () => {
  assert.equal(isAdmin(parseParticipant("ADMIN:u1")), true);
  assert.equal(isAdmin(parseParticipant("AGENT:a1")), false);
  assert.equal(isAdmin(parseParticipant("VISITOR:v1")), false);
  assert.equal(isAdmin(null), false);
});

test("the rooms that must be asked for are the private ones", () => {
  assert.equal(needsRequestToJoin("TEAM"), true);
  assert.equal(needsRequestToJoin("SESSION"), true);
  assert.equal(needsRequestToJoin("GROUP"), false);
  assert.equal(needsRequestToJoin("SUPPORT"), false);
  assert.equal(needsRequestToJoin("DIRECT"), false);
});

test("a room without a title still has one", () => {
  assert.equal(fallbackTitle("SUPPORT", "Ama"), "Enquiry from Ama");
  assert.equal(fallbackTitle("SUPPORT", ""), "Enquiry");
  assert.equal(fallbackTitle("GROUP", ""), "Group");
  assert.equal(fallbackTitle("GROUP", "All data agents"), "All data agents");
});
