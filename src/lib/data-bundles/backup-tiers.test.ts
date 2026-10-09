import { test } from "node:test";
import assert from "node:assert/strict";

const { tierFor, isoWeek, sameIsoWeek, sameMonth } = await import("./backup-tiers.ts");

/**
 * These rules decide how far back a business can recover. A tier that quietly
 * stops being taken costs nothing today and everything on the morning it is
 * needed, so the cases that matter most here are the ones where the job did
 * not run when it should have.
 *
 * Run with: npm test
 */

const at = (iso: string) => new Date(iso);

test("the very first run takes the monthly", () => {
  assert.equal(tierFor(at("2026-10-09T02:17:00Z"), { weekly: null, monthly: null }), "auto-monthly");
});

test("a new calendar month takes the monthly, whatever day it lands on", () => {
  // The 1st fell on a Sunday and the job did not run; the 2nd still owes the
  // month a monthly.
  assert.equal(
    tierFor(at("2026-11-02T02:17:00Z"), {
      weekly: at("2026-10-26T02:17:00Z"),
      monthly: at("2026-10-01T02:17:00Z"),
    }),
    "auto-monthly",
  );
});

test("a new week inside the same month takes the weekly", () => {
  assert.equal(
    tierFor(at("2026-10-12T02:17:00Z"), {
      weekly: at("2026-10-05T02:17:00Z"),
      monthly: at("2026-10-01T02:17:00Z"),
    }),
    "auto-weekly",
  );
});

test("the same week and month takes a daily", () => {
  assert.equal(
    tierFor(at("2026-10-08T02:17:00Z"), {
      weekly: at("2026-10-05T02:17:00Z"),
      monthly: at("2026-10-01T02:17:00Z"),
    }),
    "auto-daily",
  );
});

test("a monthly counts as that week's weekly", () => {
  // The caller folds the monthly into `weekly` for exactly this reason: the
  // month's first snapshot is also that week's, so the next day is a daily and
  // not a second weekly.
  const monthly = at("2026-11-02T02:17:00Z");
  assert.equal(tierFor(at("2026-11-03T02:17:00Z"), { weekly: monthly, monthly }), "auto-daily");
});

test("a gap of several days does not skip the week it lands in", () => {
  // Nothing ran for a fortnight. The next run is owed the current week.
  assert.equal(
    tierFor(at("2026-10-26T02:17:00Z"), {
      weekly: at("2026-10-12T02:17:00Z"),
      monthly: at("2026-10-01T02:17:00Z"),
    }),
    "auto-weekly",
  );
});

test("ISO weeks are numbered with the year Thursday falls in", () => {
  // 1 Jan 2027 is a Friday, and belongs to week 53 of 2026 — comparing week
  // numbers without the year would call it the same week as early January.
  assert.deepEqual(isoWeek(at("2027-01-01T00:00:00Z")), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(at("2026-01-01T00:00:00Z")), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek(at("2026-10-05T00:00:00Z")), { year: 2026, week: 41 });
});

test("a week that straddles New Year is one week, and the next is not", () => {
  // 31 Dec 2026 (Thursday) and 1 Jan 2027 (Friday) are the same ISO week.
  assert.equal(sameIsoWeek(at("2026-12-31T00:00:00Z"), at("2027-01-01T00:00:00Z")), true);
  assert.equal(sameIsoWeek(at("2027-01-01T00:00:00Z"), at("2027-01-04T00:00:00Z")), false);
});

test("a week runs Monday to Sunday", () => {
  const monday = at("2026-10-05T00:00:00Z");
  assert.equal(sameIsoWeek(monday, at("2026-10-11T23:59:59Z")), true, "Sunday is still that week");
  assert.equal(sameIsoWeek(monday, at("2026-10-12T00:00:00Z")), false, "Monday starts a new one");
  assert.equal(sameIsoWeek(monday, at("2026-10-04T23:59:59Z")), false, "the Sunday before is not");
});

test("the same month across a year boundary is not the same month", () => {
  assert.equal(sameMonth(at("2026-12-31T00:00:00Z"), at("2027-12-01T00:00:00Z")), false);
  assert.equal(sameMonth(at("2026-12-01T00:00:00Z"), at("2026-12-31T23:59:59Z")), true);
});

test("a run on New Year's Day takes the monthly for the new year", () => {
  assert.equal(
    tierFor(at("2027-01-01T02:17:00Z"), {
      weekly: at("2026-12-28T02:17:00Z"),
      monthly: at("2026-12-01T02:17:00Z"),
    }),
    "auto-monthly",
  );
});
