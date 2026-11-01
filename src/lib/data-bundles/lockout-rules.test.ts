import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLEARED,
  FAILURES_PER_STAGE,
  afterFailure,
  afterSuccess,
  lockMessage,
  lockStatus,
  type LockoutState,
} from "./lockout-rules.ts";

/**
 * The escalation, walked through as somebody guessing would experience it.
 * Each stage is reached by failing, waited out, and then reached again — the
 * part worth being sure about is that waiting does not undo it.
 */

const T0 = new Date("2026-11-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const fresh: LockoutState = { failedLoginCount: 0, lockoutStage: 0, lockedUntil: null };

/** Fail `n` times in a row from `state`, returning where it ends up. */
function failTimes(state: LockoutState, n: number, now: Date): LockoutState {
  let s = state;
  for (let i = 0; i < n; i++) s = afterFailure(s, now).next;
  return s;
}

test("four wrong passwords cost nothing", () => {
  const s = failTimes(fresh, 4, T0);
  assert.equal(s.lockoutStage, 0);
  assert.equal(lockStatus(s, T0).locked, false);
  assert.equal(s.failedLoginCount, 4);
});

test("the fifth locks the account for a minute", () => {
  const s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  const status = lockStatus(s, T0);
  assert.equal(status.locked, true);
  assert.equal(status.stage, 1);
  assert.equal(status.needsAdmin, false);
  assert.equal(status.retryAfter, 60);
});

test("the minute lifts on its own", () => {
  const s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  assert.equal(lockStatus(s, at(59_000)).locked, true);
  assert.equal(lockStatus(s, at(60_001)).locked, false);
});

test("but the stage is remembered, so the next run costs half an hour", () => {
  // The whole point: waiting out a lock must not buy another cheap one.
  let s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  const later = at(61_000);
  assert.equal(lockStatus(s, later).locked, false);
  assert.equal(lockStatus(s, later).stage, 1, "the stage survives the lock lifting");

  s = failTimes(s, FAILURES_PER_STAGE, later);
  const status = lockStatus(s, later);
  assert.equal(status.locked, true);
  assert.equal(status.stage, 2);
  assert.equal(status.retryAfter, 30 * 60);
});

test("the one that escalates to half an hour is the one that tells the admins", () => {
  const s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  const later = at(61_000);
  let cur = s;
  const outcomes = [];
  for (let i = 0; i < FAILURES_PER_STAGE; i++) {
    const o = afterFailure(cur, later);
    outcomes.push(o);
    cur = o.next;
  }
  assert.deepEqual(outcomes.map((o) => o.justLocked), [false, false, false, false, true]);
  assert.equal(outcomes.at(-1)!.stage, 2);
});

test("a third run holds the account until a person lets it go", () => {
  let s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  const t1 = at(61_000);
  s = failTimes(s, FAILURES_PER_STAGE, t1);
  const t2 = at(61_000 + 30 * 60_000 + 1_000);
  assert.equal(lockStatus(s, t2).locked, false, "the half hour does lift");
  s = failTimes(s, FAILURES_PER_STAGE, t2);

  const status = lockStatus(s, t2);
  assert.equal(status.locked, true);
  assert.equal(status.stage, 3);
  assert.equal(status.needsAdmin, true);
  assert.equal(status.until, null);
});

test("and no amount of waiting lifts that one", () => {
  let s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  s = failTimes(s, FAILURES_PER_STAGE, at(61_000));
  s = failTimes(s, FAILURES_PER_STAGE, at(61_000 + 30 * 60_000 + 1_000));
  const aYear = at(365 * 24 * 60 * 60 * 1000);
  assert.equal(lockStatus(s, aYear).locked, true);
  assert.equal(lockStatus(s, aYear).needsAdmin, true);
});

test("getting in clears the history", () => {
  const s = afterSuccess();
  assert.deepEqual(s, CLEARED);
  assert.equal(lockStatus(s, T0).locked, false);
  // and the next run starts at a minute again, not where it left off
  assert.equal(lockStatus(failTimes(s, FAILURES_PER_STAGE, T0), T0).stage, 1);
});

test("the message says how long, and never whether the account exists", () => {
  const minute = lockStatus(failTimes(fresh, FAILURES_PER_STAGE, T0), T0);
  assert.match(lockMessage(minute), /locked for 1 minute\b/, "the spec says a minute, so it should say a minute");

  let s = failTimes(fresh, FAILURES_PER_STAGE, T0);
  s = failTimes(s, FAILURES_PER_STAGE, at(61_000));
  assert.match(lockMessage(lockStatus(s, at(61_000))), /locked for 30 minutes/);

  s = failTimes(s, FAILURES_PER_STAGE, at(61_000 + 30 * 60_000 + 1_000));
  const held = lockMessage(lockStatus(s, at(61_000 + 30 * 60_000 + 2_000)));
  assert.match(held, /administrator/);
  assert.doesNotMatch(held, /password is|no such account/i);
});
