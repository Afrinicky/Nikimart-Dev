import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boardExcerpt,
  performanceEligible,
  performanceGrade,
  periodRange,
  pointsForGrade,
  pointsForRank,
  pointsToNextReward,
  rankStandings,
  windowStart,
} from "./leaderboard-rules.ts";

/**
 * The leaderboard's rules.
 *
 * Every one of these is something an agent will notice immediately if it is
 * wrong: a period that ends on the wrong day pays the wrong month's winner, a
 * tie broken by accident reshuffles the board on every refresh, and an
 * eligibility rule that lets a day-old account top the performance board is
 * the fastest way to make every other agent stop believing in it.
 *
 * Run with: npm test
 */

const AT = (iso: string) => new Date(iso);

// --- Periods ----------------------------------------------------------------

test("a month runs from the first to the first", () => {
  const range = periodRange("MONTH", AT("2026-09-12T14:00:00Z"));
  assert.equal(range.key, "2026-09");
  assert.equal(range.start?.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(range.end?.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(range.label, "September 2026");
});

test("the previous month is the one that can be paid for", () => {
  const range = periodRange("MONTH", AT("2026-01-03T09:00:00Z"), 1);
  assert.equal(range.key, "2025-12");
  assert.equal(range.start?.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(range.end?.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("a week starts on Monday, wherever in it you ask", () => {
  // 12 Sep 2026 is a Saturday; its Monday is the 7th.
  const saturday = periodRange("WEEK", AT("2026-09-12T23:30:00Z"));
  const monday = periodRange("WEEK", AT("2026-09-07T00:00:00Z"));
  assert.equal(saturday.start?.toISOString(), "2026-09-07T00:00:00.000Z");
  assert.equal(saturday.key, monday.key);
});

test("Sunday belongs to the week that began the Monday before it, not the one after", () => {
  const sunday = periodRange("WEEK", AT("2026-09-13T12:00:00Z"));
  assert.equal(sunday.start?.toISOString(), "2026-09-07T00:00:00.000Z");
});

test("a week is seven days long and the next one starts where it ends", () => {
  const week = periodRange("WEEK", AT("2026-09-12T00:00:00Z"));
  const previous = periodRange("WEEK", AT("2026-09-12T00:00:00Z"), 1);
  assert.equal(previous.end?.toISOString(), week.start?.toISOString());
});

test("all time has no beginning, no end, and so never closes", () => {
  const range = periodRange("ALL", AT("2026-09-12T00:00:00Z"));
  assert.equal(range.start, null);
  assert.equal(range.end, null);
});

test("the performance window reaches back exactly the configured days", () => {
  const from = windowStart(AT("2026-09-30T00:00:00Z"), 30);
  assert.equal(from.toISOString(), "2026-08-31T00:00:00.000Z");
});

// --- Ranking ----------------------------------------------------------------

const S = (agentId: string, score: number, value = 0) => ({ agentId, score, value });

test("the highest score is first", () => {
  const ranked = rankStandings([S("b", 143), S("a", 156), S("c", 127)]);
  assert.deepEqual(
    ranked.map((r) => [r.agentId, r.rank]),
    [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ],
  );
});

test("cedis break a tie on the count", () => {
  const ranked = rankStandings([S("a", 10, 200), S("b", 10, 900)]);
  assert.equal(ranked[0].agentId, "b");
});

test("a genuine tie shares a place, and the next place skips", () => {
  const ranked = rankStandings([S("a", 10, 100), S("b", 10, 100), S("c", 4)]);
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 1, 3],
  );
});

test("an empty board ranks to nothing rather than throwing", () => {
  assert.deepEqual(rankStandings([]), []);
});

// --- Current Performance eligibility ----------------------------------------

const RULES = { minAgentAgeDays: 21, minQualifyingSales: 10 };
const NOW = AT("2026-09-12T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("a brand-new account cannot top the performance board on its first afternoon", () => {
  assert.equal(
    performanceEligible({ joinedAt: daysAgo(2), salesInWindow: 400 }, RULES, NOW),
    false,
  );
});

test("an old account with too few recent sales is not on it either", () => {
  assert.equal(performanceEligible({ joinedAt: daysAgo(900), salesInWindow: 9 }, RULES, NOW), false);
});

test("clearing both bars puts an agent on the board", () => {
  assert.equal(performanceEligible({ joinedAt: daysAgo(21), salesInWindow: 10 }, RULES, NOW), true);
});

test("with the bars at zero, everybody who sold anything is eligible", () => {
  const open = { minAgentAgeDays: 0, minQualifyingSales: 0 };
  assert.equal(performanceEligible({ joinedAt: NOW, salesInWindow: 1 }, open, NOW), true);
});

// --- Points -----------------------------------------------------------------

test("only the top three places pay", () => {
  const points: [number, number, number] = [100, 75, 50];
  assert.equal(pointsForRank(1, points), 100);
  assert.equal(pointsForRank(3, points), 50);
  assert.equal(pointsForRank(4, points), 0);
  assert.equal(pointsForRank(0, points), 0);
});

const BONUS = {
  excellentSales: 25,
  excellentPoints: 20,
  exceptionalSales: 50,
  exceptionalPoints: 40,
};

test("a performance is graded on the better bar it clears", () => {
  assert.equal(performanceGrade(60, BONUS), "EXCEPTIONAL");
  assert.equal(performanceGrade(30, BONUS), "EXCELLENT");
  assert.equal(performanceGrade(24, BONUS), null);
});

test("a bar of zero is off, not a grade everybody gets", () => {
  const off = { ...BONUS, excellentSales: 0, exceptionalSales: 0 };
  assert.equal(performanceGrade(0, off), null);
  assert.equal(performanceGrade(500, off), null);
});

test("the grade decides the points", () => {
  assert.equal(pointsForGrade("EXCEPTIONAL", BONUS), 40);
  assert.equal(pointsForGrade("EXCELLENT", BONUS), 20);
  assert.equal(pointsForGrade(null, BONUS), 0);
});

// --- What the dashboard shows -----------------------------------------------

const BOARD = ["a", "b", "c", "d", "e", "f", "g"].map((agentId) => ({ agentId }));

test("an agent in the top three is shown once, not twice", () => {
  const { top, near } = boardExcerpt(BOARD, "b");
  assert.deepEqual(top.map((r) => r.agentId), ["a", "b", "c"]);
  assert.deepEqual(near, []);
});

test("an agent further down is shown with the people either side of them", () => {
  const { top, near } = boardExcerpt(BOARD, "e");
  assert.deepEqual(top.map((r) => r.agentId), ["a", "b", "c"]);
  assert.deepEqual(near.map((r) => r.agentId), ["d", "e", "f"]);
});

test("an agent last on the board has nobody below them, and that is fine", () => {
  const { near } = boardExcerpt(BOARD, "g");
  assert.deepEqual(near.map((r) => r.agentId), ["f", "g"]);
});

test("somebody who isn't on the board at all just sees the top", () => {
  const { top, near } = boardExcerpt(BOARD, "zz");
  assert.equal(top.length, 3);
  assert.deepEqual(near, []);
});

// --- Rewards ----------------------------------------------------------------

test("the next reward is the cheapest one still out of reach", () => {
  assert.deepEqual(pointsToNextReward(780, [500, 1000, 2500]), { next: 1000, needed: 220 });
});

test("with everything affordable there is no next reward to chase", () => {
  assert.equal(pointsToNextReward(3000, [500, 1000]), null);
});

test("a reward costing exactly what you hold is already yours", () => {
  assert.deepEqual(pointsToNextReward(500, [500, 900]), { next: 900, needed: 400 });
});
