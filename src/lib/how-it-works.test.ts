import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOW_IT_WORKS,
  parseHowItWorksSteps,
  serialiseHowItWorksSteps,
} from "./how-it-works.ts";

/**
 * The "How it works" steps come from a settings field an admin types into, and
 * the page they render is the one explaining how a stranger's money reaches a
 * seller. So the parse never returns nothing: every unusable input falls back
 * to the built-in steps rather than leaving the page blank.
 */

test("an empty setting yields the built-in steps", () => {
  for (const raw of [undefined, null, "", "   "]) {
    assert.deepEqual(parseHowItWorksSteps(raw), DEFAULT_HOW_IT_WORKS);
  }
});

test("unusable values fall back rather than rendering nothing", () => {
  for (const raw of [
    "not json",
    "{}", // an object, not a list
    '"a string"',
    "[]", // parses, but there is nothing to show
    "[null, 3, false]", // no step-shaped entries
    '[{"body":"no title"}]', // a step with nothing to head it
    '[{"title":"   "}]', // whitespace is not a title
  ]) {
    assert.deepEqual(
      parseHowItWorksSteps(raw),
      DEFAULT_HOW_IT_WORKS,
      `expected fallback for ${JSON.stringify(raw)}`,
    );
  }
});

test("stored steps are used, in order, trimmed", () => {
  const steps = parseHowItWorksSteps(
    '[{"title":" Pay ","body":" With MoMo. "},{"title":"Collect","body":"With an OTP."}]',
  );
  assert.deepEqual(steps, [
    { title: "Pay", body: "With MoMo." },
    { title: "Collect", body: "With an OTP." },
  ]);
});

test("a step may have a title and no body", () => {
  assert.deepEqual(parseHowItWorksSteps('[{"title":"Just this"}]'), [
    { title: "Just this", body: "" },
  ]);
});

test("unusable entries are dropped without taking the good ones with them", () => {
  const steps = parseHowItWorksSteps('[{"title":"Keep me"},null,{"body":"drop me"},{"title":"Me too"}]');
  assert.deepEqual(steps.map((s) => s.title), ["Keep me", "Me too"]);
});

test("the list is capped, so one bad paste can't render thousands of steps", () => {
  const many = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ title: `Step ${i}` })));
  assert.equal(parseHowItWorksSteps(many).length, 20);
});

test("what the editor writes is what the page reads back", () => {
  // The round trip is the contract between HowItWorksField and the page.
  const edited = [
    { title: "Search", body: "Browse or paste a link." },
    { title: "Pay", body: "Mobile Money or card." },
  ];
  assert.deepEqual(parseHowItWorksSteps(serialiseHowItWorksSteps(edited)), edited);
});

test("clearing every step restores the built-in ones", () => {
  // Emptying the editor stores "", which the page reads as "use the defaults" —
  // so an admin cannot accidentally ship a page with no explanation on it.
  assert.equal(serialiseHowItWorksSteps([]), "");
  assert.equal(serialiseHowItWorksSteps([{ title: "  ", body: "orphan" }]), "");
  assert.deepEqual(parseHowItWorksSteps(serialiseHowItWorksSteps([])), DEFAULT_HOW_IT_WORKS);
});
