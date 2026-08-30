import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isExternalStoreLink,
  normaliseDataBundlesUrl,
  OWN_BUNDLE_PATH,
} from "./store-link.ts";

/**
 * The "Buy Data Bundles" link decides where every shortcut on the site sends a
 * customer. Getting it wrong is silent — no error, just a link that 404s — so
 * each of these is a way somebody actually types an address.
 */

test("an address typed the way people type it becomes a real link", () => {
  // The one that broke: no scheme, so it used to be read as a path here and
  // saved as "/www.4ubundles.store/…", a Nickimart page that does not exist.
  assert.equal(
    normaliseDataBundlesUrl("www.4ubundles.store/store/Nickland"),
    "https://www.4ubundles.store/store/Nickland",
  );
  assert.equal(
    normaliseDataBundlesUrl("4ubundles.store/store/Nickland"),
    "https://4ubundles.store/store/Nickland",
  );
  assert.equal(normaliseDataBundlesUrl("4ubundles.store"), "https://4ubundles.store");
  assert.equal(
    normaliseDataBundlesUrl("//www.4ubundles.store/x"),
    "https://www.4ubundles.store/x",
  );
});

test("a full URL is left exactly as it was written", () => {
  for (const url of [
    "https://www.4ubundles.store/store/Nickland",
    "http://www.4ubundles.store/store/Nickland",
    "https://www.justicedatashop.com",
  ]) {
    assert.equal(normaliseDataBundlesUrl(url), url);
  }
  // Including the surrounding spaces a paste brings with it.
  assert.equal(
    normaliseDataBundlesUrl("  https://www.4ubundles.store/store/Nickland  "),
    "https://www.4ubundles.store/store/Nickland",
  );
});

test("a path on this site stays a path", () => {
  assert.equal(normaliseDataBundlesUrl("/data-bundles"), "/data-bundles");
  assert.equal(normaliseDataBundlesUrl("data-bundles"), "/data-bundles");
  assert.equal(normaliseDataBundlesUrl("/store/nickland"), "/store/nickland");
  assert.equal(normaliseDataBundlesUrl("store/nickland"), "/store/nickland");
});

test("the misspelling that 404'd the sidebar, footer and carousel is repaired", () => {
  for (const wrong of ["/databundles", "databundles", "/Data-Bundles", "/data_bundles"]) {
    assert.equal(normaliseDataBundlesUrl(wrong), OWN_BUNDLE_PATH);
  }
});

test("empty means empty — the shortcuts hide rather than point nowhere", () => {
  assert.equal(normaliseDataBundlesUrl(""), "");
  assert.equal(normaliseDataBundlesUrl("   "), "");
});

test("a scheme we don't serve links to is refused, not rendered", () => {
  // Anyone who can reach this setting is an admin, but a link the site paints
  // for every visitor is not the place to be relaxed about it.
  assert.equal(normaliseDataBundlesUrl("javascript:alert(1)"), "");
  assert.equal(normaliseDataBundlesUrl("data:text/html,<script>x</script>"), "");
  assert.equal(normaliseDataBundlesUrl("mailto:someone@example.com"), "");
});

test("external links are recognised, so the anchor gets target and rel", () => {
  assert.equal(isExternalStoreLink("https://www.4ubundles.store/store/Nickland"), true);
  assert.equal(isExternalStoreLink("http://example.com"), true);
  assert.equal(isExternalStoreLink("/data-bundles"), false);
  assert.equal(isExternalStoreLink(""), false);
});
