import test from "node:test";
import assert from "node:assert/strict";
import { dedupeKeyFor, joinTags, splitTags } from "./contact-keys.ts";

/**
 * The two pure decisions the contact book rests on: whether two rows are the
 * same person, and what a group is.
 *
 * Both only show up as a bug at scale — re-importing a spreadsheet and getting
 * eight hundred contacts instead of four hundred, or a group that quietly
 * splits in two because somebody typed a trailing space.
 *
 * Run with: npm test
 */

test("the same number written three ways is one person", () => {
  const local = dedupeKeyFor("0241234567", "");
  assert.equal(dedupeKeyFor("+233 24 123 4567", ""), local);
  assert.equal(dedupeKeyFor("233241234567", ""), local);
});

test("the phone decides, even when an email is there too", () => {
  // Somebody changing their email address must not become a second contact.
  assert.equal(
    dedupeKeyFor("0241234567", "ama@example.com"),
    dedupeKeyFor("0241234567", "ama.mensah@example.com"),
  );
});

test("an email is the key only when there is no phone", () => {
  assert.equal(dedupeKeyFor("", "Ama@Example.COM"), "e:ama@example.com");
});

test("a row with neither is refused rather than given a key", () => {
  assert.equal(dedupeKeyFor("", ""), null);
  assert.equal(dedupeKeyFor("n/a", "not an email"), null);
});

test("tags are trimmed, de-duplicated and sorted", () => {
  assert.deepEqual(splitTags(" Kumasi , wholesalers,Kumasi ,, "), ["Kumasi", "wholesalers"]);
  assert.equal(joinTags(["b", "a", "a"]), "a, b");
});

test("an empty tag string is no tags, not one blank tag", () => {
  assert.deepEqual(splitTags(""), []);
  assert.deepEqual(splitTags("  ,  "), []);
});
