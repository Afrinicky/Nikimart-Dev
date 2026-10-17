import test from "node:test";
import assert from "node:assert/strict";
import { mapColumns, readCsv } from "./xlsx-read.ts";

/**
 * Reading somebody else's spreadsheet.
 *
 * Every test here is a way an import silently corrupts a contact list rather
 * than failing: a comma inside a note splitting one column into two, a BOM
 * welded to the first heading so nothing matches, a header in an order nobody
 * here chose. A failed import gets reported. A shifted one does not.
 *
 * Run with: npm test
 */

test("a quoted comma stays inside its own field", () => {
  const sheet = readCsv('Name,Phone,Note\n"Mensah, Ama",0241234567,"Pays late, always"');
  assert.deepEqual(sheet.header, ["Name", "Phone", "Note"]);
  assert.deepEqual(sheet.rows, [["Mensah, Ama", "0241234567", "Pays late, always"]]);
});

test("a doubled quote inside a quoted field is one quote", () => {
  const sheet = readCsv('Name,Note\nAma,"She said ""tomorrow"""');
  assert.deepEqual(sheet.rows, [["Ama", 'She said "tomorrow"']]);
});

test("Excel's BOM does not become part of the first heading", () => {
  const sheet = readCsv("﻿Name,Phone\nAma,0241234567");
  assert.equal(sheet.header[0], "Name");
  assert.equal(mapColumns(sheet.header).name, 0);
});

test("CRLF line endings and a trailing newline are not extra rows", () => {
  const sheet = readCsv("Name,Phone\r\nAma,0241234567\r\nKofi,0551112222\r\n");
  assert.equal(sheet.rows.length, 2);
  assert.deepEqual(sheet.rows[1], ["Kofi", "0551112222"]);
});

test("blank lines in the middle of a file are skipped", () => {
  const sheet = readCsv("Name,Phone\nAma,0241234567\n\n,\nKofi,0551112222");
  assert.equal(sheet.rows.length, 2);
});

test("columns are matched by what the heading says, in any order", () => {
  const cols = mapColumns(["E-mail", "Mobile Number", "Full Name", "Segment", "Remarks"]);
  assert.equal(cols.email, 0);
  assert.equal(cols.phone, 1);
  assert.equal(cols.name, 2);
  assert.equal(cols.tags, 3);
  assert.equal(cols.note, 4);
});

test("a sheet with no recognisable header falls back to our own export's order", () => {
  // Somebody deleted the header row. Position is the only thing left, and the
  // shape this console exports is the best guess available.
  const cols = mapColumns(["Ama", "0241234567", "ama@example.com"]);
  assert.deepEqual(cols, { name: 0, phone: 1, email: 2, tags: 3, note: 4 });
});

test("a missing column reads as absent rather than as column zero", () => {
  // -1 means "not in this sheet". Zero would silently fill every contact's
  // note with their name.
  const cols = mapColumns(["Name", "Phone"]);
  assert.equal(cols.note, -1);
  assert.equal(cols.tags, -1);
});
