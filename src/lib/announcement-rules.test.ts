import test from "node:test";
import assert from "node:assert/strict";
import {
  announcementStatus,
  isShowable,
  reaches,
} from "./announcement-rules.ts";

/**
 * When a notice is live.
 *
 * Every case here is one where the admin's screen and the agent's screen could
 * disagree — a notice that reads "Live" and shows to nobody, or one switched
 * off that keeps appearing. Both are the same bug seen from two ends.
 *
 * Run with: npm test
 */

const NOW = Date.parse("2026-06-15T12:00:00Z");
const before = new Date(NOW - 86_400_000);
const after = new Date(NOW + 86_400_000);

test("a notice with no window is live the moment it is written", () => {
  assert.equal(announcementStatus({ isActive: true }, NOW), "live");
  assert.equal(isShowable({ isActive: true }, NOW), true);
});

test("a window that has not opened is scheduled, not live", () => {
  assert.equal(announcementStatus({ isActive: true, publishAt: after }, NOW), "scheduled");
  assert.equal(isShowable({ isActive: true, publishAt: after }, NOW), false);
});

test("a window that has closed is expired, not live", () => {
  assert.equal(announcementStatus({ isActive: true, expiresAt: before }, NOW), "expired");
  assert.equal(isShowable({ isActive: true, expiresAt: before }, NOW), false);
});

test("inside the window it is live", () => {
  assert.equal(
    announcementStatus({ isActive: true, publishAt: before, expiresAt: after }, NOW),
    "live",
  );
});

test("switching it off beats any schedule under it", () => {
  // An admin who hid a notice has said so; a publish date is not a second
  // opinion that can bring it back.
  assert.equal(
    announcementStatus({ isActive: false, publishAt: before, expiresAt: after }, NOW),
    "hidden",
  );
  assert.equal(isShowable({ isActive: false, publishAt: before }, NOW), false);
});

test("an expiry exactly now has passed", () => {
  assert.equal(announcementStatus({ isActive: true, expiresAt: new Date(NOW) }, NOW), "expired");
});

test("dates read as strings behave the same as dates", () => {
  assert.equal(
    announcementStatus({ isActive: true, publishAt: after.toISOString() }, NOW),
    "scheduled",
  );
  // An unparseable date is no window at all rather than a notice nobody sees.
  assert.equal(announcementStatus({ isActive: true, publishAt: "not a date" }, NOW), "live");
});

test("everyone means everyone, and anything else means exactly itself", () => {
  assert.equal(reaches("EVERYONE", "AGENTS"), true);
  assert.equal(reaches("EVERYONE", "CUSTOMERS"), true);
  assert.equal(reaches("AGENTS", "AGENTS"), true);
  assert.equal(reaches("AGENTS", "CUSTOMERS"), false);
  assert.equal(reaches("CUSTOMERS", "AGENTS"), false);
});
