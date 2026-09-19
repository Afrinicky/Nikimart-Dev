import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, describeRange, bucketSize, parseDay, resolveWindow } from "./overview-window.ts";

/** A fixed "today" so the presets are testable at all. */
const NOW = new Date(2026, 2, 14, 15, 30); // 14 March 2026, afternoon

test("a preset covers whole days, ending with today", () => {
  const w = resolveWindow({ days: "7" }, NOW);
  assert.equal(w.key, "7");
  assert.equal(w.days, 7);
  assert.equal(w.from, "2026-03-08");
  assert.equal(w.to, "2026-03-14");
  assert.equal(w.label, "last 7 days");
  // Exclusive end, so everything that happened today is inside the window.
  assert.equal(dayKey(w.end), "2026-03-15");
});

test("an unreadable range falls back to thirty days rather than erroring", () => {
  for (const days of [undefined, "", "12", "abc", "-7"]) {
    assert.equal(resolveWindow({ days }, NOW).days, 30, `days=${days}`);
  }
});

test("all time has no start and no baseline to compare against", () => {
  const w = resolveWindow({ days: "all" }, NOW);
  assert.equal(w.start, null);
  assert.equal(w.days, null);
  assert.equal(w.key, "all");
  assert.equal(w.label, "all time");
});

test("a pair of dates wins over whatever preset was on the URL", () => {
  const w = resolveWindow({ days: "90", from: "2026-03-01", to: "2026-03-14" }, NOW);
  assert.equal(w.key, "custom");
  assert.equal(w.days, 14);
  assert.equal(w.from, "2026-03-01");
  assert.equal(w.to, "2026-03-14");
});

test("dates given back to front are read as a slip, not an empty window", () => {
  const w = resolveWindow({ from: "2026-03-14", to: "2026-03-01" }, NOW);
  assert.equal(w.from, "2026-03-01");
  assert.equal(w.to, "2026-03-14");
  assert.equal(w.days, 14);
});

test("a range running into the future stops at today", () => {
  // Counting an empty fortnight ahead would halve every daily average.
  const w = resolveWindow({ from: "2026-03-01", to: "2026-12-31" }, NOW);
  assert.equal(w.to, "2026-03-14");
  assert.equal(w.days, 14);
});

test("half a range is not a range — it falls back to the preset", () => {
  assert.equal(resolveWindow({ from: "2026-03-01" }, NOW).key, "30");
  assert.equal(resolveWindow({ to: "2026-03-01" }, NOW).key, "30");
});

test("a date that does not exist is not a date", () => {
  assert.equal(parseDay("2026-02-31"), null);
  assert.equal(parseDay("2026-13-01"), null);
  assert.equal(parseDay("14/03/2026"), null);
  assert.equal(parseDay(""), null);
  assert.equal(parseDay(undefined), null);
  assert.equal(dayKey(parseDay("2026-03-14")!), "2026-03-14");
});

test("a range reads as one date, one month, or two", () => {
  assert.equal(describeRange(new Date(2026, 2, 1), new Date(2026, 2, 14)), "1–14 Mar 2026");
  assert.equal(describeRange(new Date(2026, 1, 28), new Date(2026, 2, 3)), "28 Feb – 3 Mar 2026");
  assert.equal(describeRange(new Date(2025, 11, 30), new Date(2026, 0, 2)), "30 Dec 2025 – 2 Jan 2026");
  assert.equal(describeRange(new Date(2026, 2, 14), new Date(2026, 2, 14)), "14 Mar 2026");
});

test("a long window is drawn in weeks or months, never in pixels", () => {
  assert.equal(bucketSize(7), 1);
  assert.equal(bucketSize(92), 1);
  assert.equal(bucketSize(93), 7);
  assert.equal(bucketSize(550), 7);
  assert.equal(bucketSize(551), 30);
  // Whatever the span, the chart never gets more points than it can draw.
  for (const span of [1, 90, 365, 900, 3650]) {
    assert.ok(Math.ceil(span / bucketSize(span)) <= 122, `span=${span}`);
  }
});
