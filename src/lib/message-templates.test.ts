import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_TEMPLATES,
  exampleVars,
  placeholdersIn,
  renderMessage,
  smsSegments,
  templatesFor,
  unknownPlaceholders,
} from "./message-templates.ts";

/**
 * The automatic messages, and the text substitution behind them.
 *
 * Everything here is a way a message reaches a real person looking wrong: a
 * brace left in it, a name silently blanked, a template that declares a
 * placeholder it never uses, or a cedi sign quietly tripling the cost of a
 * broadcast.
 *
 * Run with: npm test
 */

test("placeholders are filled from the values given", () => {
  assert.equal(
    renderMessage("Hi {{name}}, order {{reference}} is on its way.", {
      name: "Ama",
      reference: "ND-123",
    }),
    "Hi Ama, order ND-123 is on its way.",
  );
});

test("a placeholder nobody supplied is left alone, never blanked", () => {
  // "sent to {{phone}}" is a visible mistake somebody reports. "sent to " is
  // one nobody notices, which is worse.
  assert.equal(renderMessage("sent to {{phone}}", {}), "sent to {{phone}}");
  assert.equal(renderMessage("sent to {{phone}}", { phone: undefined as never }), "sent to {{phone}}");
});

test("a placeholder supplied as empty disappears, braces and all", () => {
  // The bug this exists to stop: a buyer with nothing outstanding was told
  // "...arrived in Ghana at Tema Port. {{balanceNote}} We'll tell you...".
  assert.equal(
    renderMessage("arrived at {{where}}. {{balanceNote}} We'll be in touch.", {
      where: "Tema Port",
      balanceNote: "",
    }),
    "arrived at Tema Port. We'll be in touch.",
  );
  // And it still reads correctly when there *is* something to say.
  assert.equal(
    renderMessage("arrived at {{where}}. {{balanceNote}} We'll be in touch.", {
      where: "Tema Port",
      balanceNote: "GH₵120.00 is due on collection.",
    }),
    "arrived at Tema Port. GH₵120.00 is due on collection. We'll be in touch.",
  );
});

test("emptying a placeholder closes the hole rather than leaving one", () => {
  // A clause that went takes its space with it...
  assert.equal(renderMessage("Declined. {{reason}} Call us.", { reason: "" }), "Declined. Call us.");
  // ...and a paragraph that emptied does not leave a blank one behind.
  assert.equal(
    renderMessage("Hi there.\n\n{{note}}\n\nThanks.", { note: "" }),
    "Hi there.\n\nThanks.",
  );
  // The space before punctuation goes too, so no "landed in Ghana ." .
  assert.equal(renderMessage("landed in Ghana {{note}}.", { note: "" }), "landed in Ghana.");
});

test("text with nothing emptied is passed through exactly as written", () => {
  // tidyMessage is a repair, not a formatter: an admin's own double spacing
  // and blank lines survive untouched when no placeholder was removed.
  const written = "Hi  {{name}},\n\n\nYour order is ready.   ";
  assert.equal(renderMessage(written, { name: "Ama" }), "Hi  Ama,\n\n\nYour order is ready.   ");
});

test("whitespace inside the braces is tolerated", () => {
  assert.equal(renderMessage("Hi {{ name }}", { name: "Ama" }), "Hi Ama");
});

test("numbers and zero come through", () => {
  assert.equal(renderMessage("{{count}} left", { count: 0 }), "0 left");
});

test("a misspelt placeholder is reported rather than silently dropped", () => {
  const template = MESSAGE_TEMPLATES.find((t) => t.key === "bundle.delivered")!;
  assert.deepEqual(unknownPlaceholders(template, "Ref {{referance}}"), ["referance"]);
  assert.deepEqual(unknownPlaceholders(template, "Ref {{reference}}"), []);
});

test("every template's own text only uses placeholders it declares", () => {
  for (const t of MESSAGE_TEMPLATES) {
    const texts = [t.sms, t.emailSubject ?? "", t.emailBody ?? ""];
    for (const text of texts) {
      assert.deepEqual(
        unknownPlaceholders(t, text),
        [],
        `${t.key} uses a placeholder it does not declare`,
      );
    }
  }
});

test("every declared placeholder is used somewhere in its template", () => {
  // A variable nobody can see in the text is a variable the editor lists and
  // the admin cannot use.
  for (const t of MESSAGE_TEMPLATES) {
    const used = new Set([
      ...placeholdersIn(t.sms),
      ...placeholdersIn(t.emailSubject ?? ""),
      ...placeholdersIn(t.emailBody ?? ""),
    ]);
    for (const v of t.variables) {
      assert.ok(used.has(v.name), `${t.key} declares {{${v.name}}} but never uses it`);
    }
  }
});

test("keys are unique, and each console only sees its own", () => {
  const keys = MESSAGE_TEMPLATES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(templatesFor("data").every((t) => t.scope === "data"));
  assert.ok(templatesFor("retail").every((t) => t.scope === "retail"));
  assert.ok(templatesFor("data").length > 0 && templatesFor("retail").length > 0);
});

test("a filled-in message has no braces left in it", () => {
  for (const t of MESSAGE_TEMPLATES) {
    const out = renderMessage(t.sms, exampleVars(t));
    assert.ok(!out.includes("{{"), `${t.key} still has a placeholder after rendering`);
  }
});

test("a cedi sign costs three times as many segments as plain text", () => {
  const plain = smsSegments("a".repeat(160));
  assert.deepEqual([plain.segments, plain.unicode], [1, false]);
  // 160 plain characters is one segment; the same length with a ₵ in it is
  // three, because the network drops to 70 characters a part.
  const unicode = smsSegments("₵" + "a".repeat(159));
  assert.deepEqual([unicode.segments, unicode.unicode], [3, true]);
});
