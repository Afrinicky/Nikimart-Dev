import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inviteSlugProblem,
  inviteSlugUrl,
  isReservedInviteSlug,
  normaliseInviteSlug,
  RESERVED_INVITE_SLUGS,
} from "./invite-rules.ts";

/**
 * Short paths on a registration link.
 *
 * Each of these is a way to end up with an advert that goes somewhere other
 * than registration. The two that matter most are at the bottom: a path that
 * names a page the site already has can never be reached, because Next.js
 * answers the static route first — and a path the admin typed as a whole URL,
 * or with a capital letter, has to end up as the same link as the one in the ad.
 *
 * Run with: npm test
 */

test("a plain word is kept as it is", () => {
  assert.equal(normaliseInviteSlug("join"), "join");
  assert.equal(normaliseInviteSlug("fb-ads-2026"), "fb-ads-2026");
});

test("case and surrounding whitespace don't make a different link", () => {
  // Typed into a phone browser, the keyboard capitalises the first letter.
  assert.equal(normaliseInviteSlug("Join"), "join");
  assert.equal(normaliseInviteSlug("  JOIN  "), "join");
});

test("a slash, or a whole URL, is reduced to the path", () => {
  assert.equal(normaliseInviteSlug("/join"), "join");
  assert.equal(normaliseInviteSlug("join/"), "join");
  assert.equal(normaliseInviteSlug("https://nickimart.com/join"), "join");
  assert.equal(normaliseInviteSlug("http://nickimart.com/join/"), "join");
});

test("anything that isn't a path character becomes a hyphen, and never doubles", () => {
  assert.equal(normaliseInviteSlug("campus drive"), "campus-drive");
  assert.equal(normaliseInviteSlug("campus   drive"), "campus-drive");
  assert.equal(normaliseInviteSlug("join!!!now"), "join-now");
  assert.equal(normaliseInviteSlug("--join--"), "join");
  assert.equal(normaliseInviteSlug("accra/campus"), "accra-campus");
});

test("a path is bounded, because it goes in the unique index", () => {
  assert.equal(normaliseInviteSlug("j".repeat(60)).length, 32);
});

test("nothing usable normalises to the empty string, not to a stray hyphen", () => {
  assert.equal(normaliseInviteSlug(""), "");
  assert.equal(normaliseInviteSlug(null), "");
  assert.equal(normaliseInviteSlug(undefined), "");
  assert.equal(normaliseInviteSlug("   "), "");
  assert.equal(normaliseInviteSlug("!!!"), "");
  assert.equal(normaliseInviteSlug("///"), "");
});

test("a one-character path is refused — too easy to reach by accident", () => {
  assert.ok(inviteSlugProblem("j"));
  assert.equal(inviteSlugProblem("jo"), null);
});

test("a path that names a page the site already has is refused", () => {
  // The reason this matters: Next.js resolves /register to the customer signup
  // page, so a link claiming it would never be reached at all — and the admin
  // would have no way to see that from the console.
  for (const taken of ["register", "login", "admin", "store", "products", "become-an-agent"]) {
    assert.ok(inviteSlugProblem(taken), `${taken} should be refused`);
    assert.ok(isReservedInviteSlug(taken));
  }
});

test("the reserved list is what it claims to be: normalised, and unique", () => {
  // A name in here that doesn't survive normalisation could never match an
  // incoming path, so the guard would silently not apply to it.
  const paths = RESERVED_INVITE_SLUGS.filter((s) => !s.startsWith("_") && !s.includes("."));
  for (const p of paths) {
    assert.equal(normaliseInviteSlug(p), p, `${p} is not in normalised form`);
  }
  assert.equal(new Set(RESERVED_INVITE_SLUGS).size, RESERVED_INVITE_SLUGS.length);
});

test("an ordinary ad word is allowed", () => {
  for (const ok of ["join", "signup", "agents-wanted", "fb", "promo", "campus-2026"]) {
    assert.equal(inviteSlugProblem(ok), null, `${ok} should be allowed`);
  }
});

test("the link is the origin and the path, with no doubled slash", () => {
  assert.equal(inviteSlugUrl("https://nickimart.com", "join"), "https://nickimart.com/join");
  assert.equal(inviteSlugUrl("https://nickimart.com/", "join"), "https://nickimart.com/join");
});
