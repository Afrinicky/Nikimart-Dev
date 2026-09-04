import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForwarder, type ForwarderInput } from "./forwarder-rules.ts";

/**
 * The rules that decide whether a forwarder can be saved at all.
 *
 * Every case here is one somebody actually hit and could not act on, because
 * the answer was always the same sentence — "a code may already be in use" —
 * whether or not a code was involved. A message that names the wrong field
 * sends somebody to change something that was never the problem.
 */

function profile(over: Partial<ForwarderInput> = {}): ForwarderInput {
  return {
    name: "CSL Clixma Supply",
    code: "CSL-SYI",
    classes: [{ key: "c1", name: "Normal Goods", isDefault: true }],
    points: [
      {
        key: "p1",
        name: "Sunyani Depot",
        code: "CSL-SUNYANI",
        routes: [{ key: "r1", mode: "sea", rates: { c1: 280 } }],
      },
    ],
    categoryMap: {},
    ...over,
  };
}

test("a complete profile passes", () => {
  assert.equal(validateForwarder(profile()), null);
});

test("a long short code is kept, not quietly cut down", () => {
  // 28 characters, which is what a forwarder with a phone number in their code
  // actually types. The old sanitiser stored the first 24 and the field and the
  // database disagreed from then on, where nobody was looking.
  const code = "CSL-SYI-NICKIMART+0208246511";
  assert.equal(code.length, 28);
  assert.equal(validateForwarder(profile({ code })), null);
});

test("a code past the limit is refused by name, with the numbers", () => {
  const problem = validateForwarder(profile({ code: "X".repeat(65) }));
  assert.match(problem ?? "", /short code is too long/);
  assert.match(problem ?? "", /64 characters at most/);
  assert.match(problem ?? "", /65/);
});

test("two classes with one name is reported as that, not as a code clash", () => {
  const problem = validateForwarder(
    profile({
      classes: [
        { key: "c1", name: "Normal Goods", isDefault: true },
        { key: "c2", name: "Normal Goods" },
      ],
    }),
  );
  assert.match(problem ?? "", /Normal Goods/);
  assert.match(problem ?? "", /Rename one/);
});

test("classes that differ only by case say so, rather than looking identical", () => {
  const problem = validateForwarder(
    profile({
      classes: [
        { key: "c1", name: "Normal Goods", isDefault: true },
        { key: "c2", name: "normal goods" },
      ],
    }),
  );
  // Both spellings, because on the screen the two rows do look different.
  assert.match(problem ?? "", /Normal Goods/);
  assert.match(problem ?? "", /normal goods/);
  assert.match(problem ?? "", /case is not what tells them apart/);
});

test("two points sharing a code names the code", () => {
  const problem = validateForwarder(
    profile({
      points: [
        { key: "p1", name: "Sunyani", code: "SAME", routes: [] },
        { key: "p2", name: "Accra", code: "same", routes: [] },
      ],
    }),
  );
  assert.match(problem ?? "", /SAME/);
});

test("codes that differ only past the old 24-character cut are distinct", () => {
  // These collapsed onto one another when codes were truncated, and the second
  // write hit the unique index — the failure the generic message came from.
  assert.equal(
    validateForwarder(
      profile({
        points: [
          { key: "p1", name: "Sunyani", code: "CSL-SYI-NICKIMART+0208246511", routes: [] },
          { key: "p2", name: "Accra", code: "CSL-SYI-NICKIMART+0208246522", routes: [] },
        ],
      }),
    ),
    null,
  );
});

test("a forwarder needs a class and a point before it can quote", () => {
  assert.match(validateForwarder(profile({ classes: [] })) ?? "", /class of goods/);
  assert.match(validateForwarder(profile({ points: [] })) ?? "", /consolidation point/);
});

test("a column with no freight mode names the point it is in", () => {
  const problem = validateForwarder(
    profile({
      points: [
        { key: "p1", name: "Sunyani Depot", code: "SUN", routes: [{ key: "r1", mode: "", rates: {} }] },
      ],
    }),
  );
  assert.match(problem ?? "", /Sunyani Depot/);
  assert.match(problem ?? "", /freight mode/);
});

test("a point without a code is asked for one, by name", () => {
  const problem = validateForwarder(
    profile({ points: [{ key: "p1", name: "Sunyani Depot", code: "", routes: [] }] }),
  );
  assert.match(problem ?? "", /Sunyani Depot/);
});
