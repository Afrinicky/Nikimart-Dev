import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistrationPdf,
  layout,
  registrationFileName,
  textWidth,
  toWinAnsi,
  wrap,
} from "./service-pdf.ts";

/**
 * The registration document.
 *
 * A PDF written by hand is a file format with a cross-reference table in it:
 * get a byte offset wrong and every reader refuses the whole document rather
 * than showing part of it. So the structure is checked here, along with the
 * two things that decide whether the sheet reads correctly — how text is
 * wrapped to the column, and what happens to characters the base fonts do not
 * have. Run with: npm test
 */

function sample(entries: Array<{ label: string; value: string }>) {
  return {
    title: "Business registration",
    subtitle: "Sole Proprietorship",
    meta: ["Reference NS-ABC123", "Standard — 7 working days"],
    sections: [{ heading: "Particulars", entries }],
    footnotes: ["Please kindly find attached the images listed above."],
  };
}

test("the cedi sign and typographic punctuation survive as something WinAnsi has", () => {
  // Dropping the currency silently would leave a figure that reads as right.
  assert.equal(toWinAnsi("GH₵450.00"), "GHS 450.00");
  assert.equal(toWinAnsi("Owner’s name"), "Owner's name");
  assert.equal(toWinAnsi("Standard — 7 days"), "Standard - 7 days");
  // Anything with no WinAnsi form at all goes rather than becoming mojibake.
  assert.equal(toWinAnsi("Rex 🏢 Services"), "Rex Services");
  // …but Latin-1 is WinAnsi from A0 up, so these are drawable and are kept.
  assert.equal(toWinAnsi("Paid · raised today"), "Paid · raised today");
  assert.equal(toWinAnsi("Tanoso Dansoman Kofí"), "Tanoso Dansoman Kofí");
});

test("text is wrapped to the column it is drawn in", () => {
  const width = 400;
  const lines = wrap(
    "Hospital supplies and consumables, general merchandise, and electrical services for the Ashanti Region",
    width,
    11,
  );
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(textWidth(line, 11) <= width, `"${line}" overruns the column`);
  }
});

test("a single word wider than the column is cut rather than run off the page", () => {
  const width = 60;
  const lines = wrap("GHA-123456789-0123456789-ABCDEFGHIJ", width, 11);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(textWidth(line, 11) <= width);
  }
});

test("empty values still take their number, so nothing is silently skipped", () => {
  const pages = layout(
    sample([
      { label: "TIN", value: "" },
      { label: "City", value: "Kumasi" },
    ]),
  );
  const drawn = pages.flat().map((op) => op.text);
  assert.ok(drawn.includes("1."));
  assert.ok(drawn.includes("2."));
  assert.ok(drawn.some((t) => t.startsWith("TIN:")));
});

test("a long form runs onto more pages, and every page is numbered", () => {
  const many = Array.from({ length: 70 }, (_, i) => ({
    label: `Question ${i + 1}`,
    value: "An answer of a reasonable, ordinary length for a registration form",
  }));
  const pdf = buildRegistrationPdf(sample(many));
  const text = Buffer.from(pdf).toString("latin1");

  const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
  assert.ok(pageCount > 1, "a 70-question form should not fit on one page");
  assert.equal((text.match(/Page \d+ of \d+/g) ?? []).length, pageCount);
});

test("the file is a PDF a reader will open", () => {
  const pdf = buildRegistrationPdf(sample([{ label: "City", value: "Kumasi" }]));
  const text = Buffer.from(pdf).toString("latin1");

  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes("/Type /Catalog"));
  assert.ok(text.includes("/BaseFont /Helvetica"));

  // The cross-reference table is the part a reader checks first: one entry per
  // object plus the free head, and every offset must land on its own object.
  const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
  const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, size - 1);
  offsets.forEach((offset, i) => {
    assert.ok(text.startsWith(`${i + 1} 0 obj`, offset), `object ${i + 1} is not at its offset`);
  });

  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  assert.ok(text.startsWith("xref", startxref));
});

test("a bracket in an answer cannot break the page it is written into", () => {
  // Unescaped, "(" ends the string early and the rest becomes instructions.
  const pdf = buildRegistrationPdf(
    sample([{ label: "Purpose", value: "Retail (general) \\ wholesale" }]),
  );
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.includes("Retail \\(general\\) \\\\ wholesale"));
});

test("the filename says which order it is", () => {
  assert.equal(
    registrationFileName("NS-ABC123", "Kwame Osei Mensah"),
    "NS-ABC123-Kwame-Osei-Mensah.pdf",
  );
  assert.equal(registrationFileName("NS-ABC123", ""), "NS-ABC123.pdf");
});
