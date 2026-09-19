import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_WINDOW_DAYS,
  daysBetween,
  growthPercent,
  isNewMember,
  memberActivity,
  TEAM_DEPTH,
  TEAM_INCOME_LABELS,
  TEAM_INCOME_TYPES,
} from "./rules.ts";

const NOW = new Date(2026, 8, 19); // 19 September 2026
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("a member who has never sold is not the same as one who stopped", () => {
  assert.equal(memberActivity(null, NOW), "never");
  assert.equal(memberActivity(undefined, NOW), "never");
  assert.equal(memberActivity(daysAgo(200), NOW), "dormant");
});

test("activity is measured against the window the team counts by", () => {
  assert.equal(memberActivity(daysAgo(0), NOW), "active");
  assert.equal(memberActivity(daysAgo(ACTIVE_WINDOW_DAYS), NOW), "active");
  assert.equal(memberActivity(daysAgo(ACTIVE_WINDOW_DAYS + 1), NOW), "quiet");
  assert.equal(memberActivity(daysAgo(ACTIVE_WINDOW_DAYS * 3), NOW), "quiet");
  assert.equal(memberActivity(daysAgo(ACTIVE_WINDOW_DAYS * 3 + 1), NOW), "dormant");
});

test("a sale timestamped slightly ahead of us is still a sale", () => {
  // Clock skew between the database and the app must not read as negative age.
  assert.equal(daysBetween(new Date(NOW.getTime() + 60_000), NOW), 0);
  assert.equal(memberActivity(new Date(NOW.getTime() + 60_000), NOW), "active");
});

test("new members are the ones who joined inside the window", () => {
  assert.equal(isNewMember(daysAgo(1), NOW), true);
  assert.equal(isNewMember(daysAgo(30), NOW), true);
  assert.equal(isNewMember(daysAgo(31), NOW), false);
});

test("starting a team is not growth of three hundred percent", () => {
  assert.equal(growthPercent(3, 0), null);
  assert.equal(growthPercent(0, 0), null);
  assert.equal(growthPercent(6, 4), 50);
  assert.equal(growthPercent(3, 4), -25);
});

test("every income type a leader can earn is named", () => {
  assert.equal(TEAM_INCOME_TYPES.length, 4);
  for (const type of TEAM_INCOME_TYPES) {
    assert.ok(TEAM_INCOME_LABELS[type], `${type} has a label`);
  }
});

test("the team is as deep as the programme pays", () => {
  assert.equal(TEAM_DEPTH, 2);
});
