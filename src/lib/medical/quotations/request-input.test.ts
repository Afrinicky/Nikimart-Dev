import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeEmail, looksLikePhone, validateRequest, LIMITS } from "./request-input.ts";

const ok = (input: Parameters<typeof validateRequest>[0]) => {
  const result = validateRequest(input);
  assert.equal(result.ok, true, result.ok ? "" : `${result.field}: ${result.error}`);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
};

const fails = (input: Parameters<typeof validateRequest>[0], field: string) => {
  const result = validateRequest(input);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.field, field);
  return result.error;
};

const base = {
  contactName: "Ama Mensah",
  contactEmail: "ama@korlebu.example",
  lines: [{ productId: "p1", description: "Glucose reagent", quantity: 4 }],
};

test("a request needs somebody to reply to", () => {
  fails({ ...base, contactName: "  " }, "contactName");
});

test("a request needs a way to reply", () => {
  fails({ ...base, contactEmail: "", contactPhone: "" }, "contactEmail");
  // Either one on its own is enough: a laboratory that rings is still a lead.
  ok({ ...base, contactEmail: "", contactPhone: "024 123 4567" });
});

test("an address that cannot be replied to is caught, within reason", () => {
  assert.equal(looksLikeEmail("ama@korlebu.example"), true);
  assert.equal(looksLikeEmail("ama+lab@sub.domain.gh"), true);
  assert.equal(looksLikeEmail("ama.korlebu.example"), false);
  assert.equal(looksLikeEmail("ama@localhost"), false);
  assert.equal(looksLikeEmail("ama @x.com"), false);
  fails({ ...base, contactEmail: "ama.korlebu.example" }, "contactEmail");
});

test("a telephone number is judged on whether it could be dialled", () => {
  assert.equal(looksLikePhone("+233 24 123 4567"), true);
  assert.equal(looksLikePhone("0241234567"), true);
  assert.equal(looksLikePhone("024-123"), false);
  fails({ ...base, contactEmail: "", contactPhone: "024" }, "contactPhone");
});

test("a request with nothing in it is refused", () => {
  fails({ ...base, lines: [] }, "specialRequest");
});

test("but a request with no catalogue lines and a description is not", () => {
  const value = ok({
    ...base,
    lines: [],
    specialRequest: "A benchtop autoclave, 23 litre, 240V.",
  });
  assert.equal(value.lines.length, 0);
  assert.match(value.specialRequest, /autoclave/);
});

test("an empty row left in the form is dropped, not refused", () => {
  const value = ok({
    ...base,
    lines: [
      { productId: "p1", description: "Glucose reagent", quantity: 2 },
      { description: "   ", quantity: 1 },
    ],
  });
  assert.equal(value.lines.length, 1);
});

test("quantities are whole, at least one, and bounded", () => {
  const value = ok({
    ...base,
    lines: [
      { productId: "a", description: "x", quantity: 2.7 },
      { productId: "b", description: "y", quantity: 0 },
      { productId: "c", description: "z", quantity: -5 },
      { productId: "d", description: "w", quantity: 9e12 },
      { productId: "e", description: "v", quantity: Number.NaN },
    ],
  });
  assert.deepEqual(
    value.lines.map((line) => line.quantity),
    [2, 1, 1, LIMITS.quantity, 1],
  );
});

test("an institution type has to be one of ours", () => {
  ok({ ...base, institutionType: "HOSPITAL" });
  fails({ ...base, institutionType: "DENTIST" }, "institutionType");
  // Left blank is fine — not everybody is an institution.
  ok({ ...base, institutionType: "" });
});

test("free text is trimmed and bounded rather than refused", () => {
  const value = ok({ ...base, notes: `  ${"n".repeat(5000)}  ` });
  assert.equal(value.notes.length, LIMITS.notes);
});

test("more lines than anyone means are cut off", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    productId: `p${i}`,
    description: `Item ${i}`,
    quantity: 1,
  }));
  assert.equal(ok({ ...base, lines: many }).lines.length, LIMITS.lines);
});

test("a date that cannot be read is dropped, and the request still stands", () => {
  assert.equal(ok({ ...base, requiredBy: "not a date" }).requiredBy, null);
  const value = ok({ ...base, requiredBy: "2026-12-01" });
  assert.equal(value.requiredBy?.getUTCFullYear(), 2026);
});

test("a line keeps its own words even when it names a product", () => {
  const value = ok({
    ...base,
    lines: [{ productId: "p1", description: "Glucose reagent", catalogueNumber: "GLU-500", quantity: 1 }],
  });
  assert.equal(value.lines[0].productId, "p1");
  assert.equal(value.lines[0].description, "Glucose reagent");
  assert.equal(value.lines[0].catalogueNumber, "GLU-500");
  assert.equal(value.lines[0].unit, "unit");
});
