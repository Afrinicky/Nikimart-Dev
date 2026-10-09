import { test } from "node:test";
import assert from "node:assert/strict";

const { sheetToCsv } = await import("./csv.ts");

/**
 * Quoting is the whole of CSV. A narration with a comma, an admin note with a
 * newline, a store name with a quotation mark — each one shifts every column
 * after it if it goes out raw, and a column shifted by one is a number read
 * against the wrong label. These are the characters that do that.
 *
 * Run with: npm test
 */

const sheet = (rows: unknown[][]) => ({ name: "S", columns: ["a", "b"], rows: rows as never });

test("a plain sheet comes out as a header and its rows, CRLF separated", () => {
  assert.equal(sheetToCsv(sheet([["one", "two"], ["three", "four"]])), "a,b\r\none,two\r\nthree,four");
});

test("a comma in a value is quoted rather than left to end the field", () => {
  assert.equal(sheetToCsv(sheet([["Accra, Ghana", "x"]])), 'a,b\r\n"Accra, Ghana",x');
});

test("a quotation mark is doubled, the way the format says", () => {
  assert.equal(sheetToCsv(sheet([['He said "hi"', "x"]])), 'a,b\r\n"He said ""hi""",x');
});

test("a newline inside a value is quoted, not allowed to start a row", () => {
  assert.equal(sheetToCsv(sheet([["line one\nline two", "x"]])), 'a,b\r\n"line one\nline two",x');
  assert.equal(sheetToCsv(sheet([["carriage\rreturn", "x"]])), 'a,b\r\n"carriage\rreturn",x');
});

test("empty, null and undefined are all an empty field", () => {
  assert.equal(sheetToCsv(sheet([["", null], [undefined, ""]])), "a,b\r\n,\r\n,");
});

test("dates go out as ISO so a spreadsheet cannot read them as the wrong locale", () => {
  // 03/04 is March in one country and April in another; ISO is neither.
  const when = new Date("2026-03-04T09:12:33.421Z");
  assert.equal(sheetToCsv(sheet([[when, "x"]])), "a,b\r\n2026-03-04T09:12:33.421Z,x");
});

test("booleans read as words, because TRUE/FALSE in a column of text is noise", () => {
  assert.equal(sheetToCsv(sheet([[true, false]])), "a,b\r\nYes,No");
});

test("numbers stay numbers, and a non-finite one is blank rather than the text NaN", () => {
  assert.equal(sheetToCsv(sheet([[12.5, 0], [Number.NaN, Number.POSITIVE_INFINITY]])),
    "a,b\r\n12.5,0\r\n,");
});

test("a header with a comma in it is quoted too", () => {
  const s = { name: "S", columns: ["Amount, GH₵", "b"], rows: [] as never };
  assert.equal(sheetToCsv(s), '"Amount, GH₵",b');
});
