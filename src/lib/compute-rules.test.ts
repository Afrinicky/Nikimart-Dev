import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPUTE_DEFAULTS,
  LOW_COMPUTE,
  readCount,
  readCrawlerPolicy,
  readFlag,
  resolveComputeSettings,
} from "./compute-rules.ts";

test("an unset switch leaves the site working", () => {
  const s = resolveComputeSettings({});
  assert.deepEqual(s, COMPUTE_DEFAULTS);
});

test("a switch set to 0 is off and 1 is on", () => {
  assert.equal(resolveComputeSettings({ liveChatEnabled: "0" }).liveChat, false);
  assert.equal(resolveComputeSettings({ liveChatEnabled: "1" }).liveChat, true);
});

test("a value nobody can read falls back to working, never to off", () => {
  // The whole point: these are free-text rows in a key/value table, and a
  // typo must not be what takes the storefront's link previews away.
  for (const junk of ["", " ", "yes", "true", "off", "null", "2"]) {
    assert.equal(readFlag(junk), true, `readFlag(${JSON.stringify(junk)})`);
  }
  assert.equal(resolveComputeSettings({ ogImagesEnabled: "maybe" }).ogImages, true);
});

test("whitespace around a stored value does not change it", () => {
  assert.equal(readFlag(" 0 "), false);
  assert.equal(readFlag(" 1 "), true);
  assert.equal(readCrawlerPolicy("  OPEN  "), "open");
});

test("low compute mode is off unless it is explicitly on", () => {
  assert.equal(resolveComputeSettings({}).lowComputeMode, false);
  assert.equal(readFlag(undefined, false), false);
  assert.equal(resolveComputeSettings({ lowComputeMode: "1" }).lowComputeMode, true);
});

test("low compute mode forces every switch it names", () => {
  const s = resolveComputeSettings({ lowComputeMode: "1" });
  for (const [key, value] of Object.entries(LOW_COMPUTE)) {
    assert.deepEqual(s[key as keyof typeof s], value, key);
  }
});

test("low compute mode overrides a switch the admin left on", () => {
  const s = resolveComputeSettings({ lowComputeMode: "1", ogImagesEnabled: "1", liveChatEnabled: "1" });
  assert.equal(s.ogImages, false);
  assert.equal(s.liveChat, false);
});

test("low compute mode leaves short links and exchange rates alone", () => {
  // An advert already printed with /join on it must not stop working because
  // the hosting bill got tight, and a stale cedi rate costs more than the one
  // call it saves.
  const s = resolveComputeSettings({ lowComputeMode: "1" });
  assert.equal(s.inviteShortLinks, true);
  assert.equal(s.fxAutoRefresh, true);
});

test("turning low compute mode off restores what the admin chose", () => {
  const stored = { lowComputeMode: "1", liveChatEnabled: "0", ogImagesEnabled: "1", crawlerPolicy: "open" };
  assert.equal(resolveComputeSettings(stored).ogImages, false);
  // The stored values are untouched, so clearing the panic switch is enough.
  const after = resolveComputeSettings({ ...stored, lowComputeMode: "0" });
  assert.equal(after.ogImages, true);
  assert.equal(after.liveChat, false, "the admin's own 'off' survives");
  assert.equal(after.crawlerPolicy, "open");
});

test("numbers are clamped rather than trusted", () => {
  assert.equal(readCount("5", 20, 10, 600), 10, "below the floor");
  assert.equal(readCount("99999", 20, 10, 600), 600, "above the ceiling");
  assert.equal(readCount("45", 20, 10, 600), 45);
  assert.equal(readCount("45.6", 20, 10, 600), 46, "rounded");
});

test("a number that is not a number is the default", () => {
  assert.equal(readCount("", 96, 12, 500), 96);
  assert.equal(readCount("lots", 96, 12, 500), 96);
  assert.equal(readCount(undefined, 96, 12, 500), 96);
});

test("zero products in the sitemap is a real choice, not a missing value", () => {
  // Zero means "list the categories and shops, let crawlers find products by
  // following those" — it must not be read as unset and replaced by 5000.
  assert.equal(resolveComputeSettings({ sitemapProductLimit: "0" }).sitemapProductLimit, 0);
});

test("an unknown crawler policy is the balanced one", () => {
  assert.equal(readCrawlerPolicy(undefined), "lean");
  assert.equal(readCrawlerPolicy(""), "lean");
  assert.equal(readCrawlerPolicy("wide open"), "lean");
  assert.equal(readCrawlerPolicy("closed"), "closed");
});

test("no switch on this page can close the shop", () => {
  // Nothing here governs browsing, search, the cart or checkout, and this is
  // the test that says so: low compute mode is the most aggressive setting
  // available and it changes none of those.
  const s = resolveComputeSettings({ lowComputeMode: "1" });
  assert.ok(s.cataloguePageLimit >= 12, "a catalogue page still renders products");
  assert.equal(s.inviteShortLinks, true);
  assert.equal(s.fxAutoRefresh, true);
});
