import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

const { parseBackupFile, BackupFileError, toPgText } = await import("./backup-file.ts");

/**
 * A backup file arriving at the restore screen has been uploaded by somebody,
 * has travelled through a laptop and an email client, and is about to decide
 * what the entire bundle database contains. These tests are the list of ways
 * it is allowed to be wrong — each one has to be a refusal, not a surprise
 * halfway through a truncate.
 *
 * Run with: npm test
 */

function file(lines: unknown[]): Buffer {
  return gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8"));
}

const header = {
  kind: "header",
  app: "nickimart-data-bundles",
  format: "nickimart-data-backup",
  formatVersion: 1,
  id: "dbk_20261008T143012Z_ab12cd34",
  takenAt: "2026-10-08T14:30:12.000Z",
  backupKind: "manual",
  databaseId: "bundles@db.example",
  schemaVersion: "0018_backups.sql",
  appVersion: "dev",
  excludedTables: ["_prisma_migrations"],
};

const table = {
  kind: "table",
  name: "DataSetting",
  columns: [
    { name: "key", udt: "text", array: false },
    { name: "value", udt: "text", array: false },
  ],
};

const row = { kind: "row", t: "DataSetting", v: ["dataStoreName", "Nickimart Data"] };

const footer = {
  kind: "footer",
  tables: [{ table: "DataSetting", rows: 1 }],
  tableCount: 1,
  recordCount: 1,
  finishedAt: "2026-10-08T14:30:13.000Z",
};

function rejects(lines: unknown[], expected: RegExp) {
  assert.throws(() => parseBackupFile(file(lines)), (error: unknown) => {
    assert.ok(error instanceof BackupFileError, `expected a BackupFileError, got ${error}`);
    assert.match((error as Error).message, expected);
    return true;
  });
}

test("a well-formed backup parses, with its counts taken from the rows present", () => {
  const parsed = parseBackupFile(file([header, table, row, footer]));
  assert.equal(parsed.meta.id, "dbk_20261008T143012Z_ab12cd34");
  assert.equal(parsed.meta.schemaVersion, "0018_backups.sql");
  assert.equal(parsed.meta.tableCount, 1);
  assert.equal(parsed.meta.recordCount, 1);
  assert.equal(parsed.tables[0].rows.length, 1);
  assert.deepEqual(parsed.meta.counts, [{ table: "DataSetting", rows: 1 }]);
});

test("something that is not gzip is refused before anything else happens", () => {
  assert.throws(
    () => parseBackupFile(Buffer.from("definitely not a backup")),
    /not a gzipped Nickimart backup/,
  );
});

test("a file with no footer is treated as truncated, not as a small database", () => {
  // The exact shape of an upload that stopped halfway: everything before the
  // last line is perfectly valid.
  rejects([header, table, row], /no footer|truncated/);
});

test("a file with no header is refused", () => {
  rejects([table, row, footer], /begins with a table|no header/);
});

test("another application's export is refused even if the shape matches", () => {
  rejects(
    [{ ...header, app: "some-other-app" }, table, row, footer],
    /not written by Nickimart/,
  );
});

test("a newer format version is refused rather than guessed at", () => {
  rejects(
    [{ ...header, formatVersion: 99 }, table, row, footer],
    /format version 99/,
  );
});

test("counts that disagree with the rows present mean the file was altered", () => {
  rejects([header, table, row, { ...footer, recordCount: 5 }], /5 records but 1 are present/);
  rejects([header, table, row, { ...footer, tableCount: 3 }], /3 tables but 1 are present/);
  rejects(
    [header, table, row, { ...footer, tables: [{ table: "DataSetting", rows: 9 }] }],
    /should hold 9 rows but 1 are present/,
  );
});

test("a row with the wrong number of values is refused", () => {
  rejects(
    [header, table, { kind: "row", t: "DataSetting", v: ["only-one"] }, footer],
    /1 values but the table declares 2/,
  );
});

test("a row for a table the file never declared is refused", () => {
  rejects(
    [header, table, { kind: "row", t: "SomethingElse", v: ["a", "b"] }, footer],
    /never declared/,
  );
});

test("table and column names that are not plain identifiers are refused", () => {
  // These names are about to be written into SQL. Anything that needs cleverer
  // quoting than an identifier pattern is a reason to stop.
  rejects([header, { ...table, name: 'x"; DROP TABLE "DataOrder' }, footer], /not a table name/);
  rejects(
    [
      header,
      { ...table, columns: [{ name: 'a"; --', udt: "text", array: false }] },
      footer,
    ],
    /not accept/,
  );
  rejects(
    [
      header,
      { ...table, columns: [{ name: "key", udt: "text; DROP TABLE x", array: false }] },
      footer,
    ],
    /type name this restore will not accept/,
  );
});

test("a table declared twice, or a column declared twice, is refused", () => {
  rejects([header, table, table, footer], /declares DataSetting twice/);
  rejects(
    [
      header,
      {
        ...table,
        columns: [
          { name: "key", udt: "text", array: false },
          { name: "key", udt: "text", array: false },
        ],
      },
      footer,
    ],
    /declares the column key twice/,
  );
});

test("content after the footer is refused", () => {
  // Appending to a valid backup is the obvious way to try to smuggle rows past
  // a reader that stops at the first footer.
  rejects([header, table, row, footer, row], /after the end of the backup/);
});

test("a line that is not JSON is refused with its line number", () => {
  const broken = gzipSync(
    Buffer.from(`${JSON.stringify(header)}\n{not json}\n${JSON.stringify(footer)}\n`, "utf8"),
  );
  assert.throws(() => parseBackupFile(broken), /Line 2 is not valid JSON/);
});

test("an unknown record kind is refused rather than skipped", () => {
  rejects([header, table, { kind: "execute", sql: "DROP TABLE x" }, footer], /does not understand/);
});

test("a zip bomb is stopped by the decompression limit, not by a check afterwards", () => {
  // 1.5 GB of zeroes compresses to a very small upload; the limit has to apply
  // while inflating, because after inflating the memory is already gone.
  const bomb = gzipSync(Buffer.alloc(1024 * 1024 * 1024 + 1024 * 1024 * 512));
  assert.throws(() => parseBackupFile(bomb), /restore size limit|not a backup we wrote/);
});

// --- values on the way back in --------------------------------------------

test("values are rendered as Postgres text input, for Postgres to parse", () => {
  const text = { name: "c", udt: "text", array: false };
  const ts = { name: "c", udt: "timestamp", array: false };
  const num = { name: "c", udt: "numeric", array: false };
  const bytes = { name: "c", udt: "bytea", array: false };
  const json = { name: "c", udt: "jsonb", array: false };
  const bool = { name: "c", udt: "bool", array: false };

  assert.equal(toPgText("hello", text), "hello");
  assert.equal(toPgText(null, text), null);
  assert.equal(toPgText({ $date: "2026-03-04T09:12:33.421Z" }, ts), "2026-03-04T09:12:33.421Z");
  // A numeric goes back as the exact digits it came out with — never through a
  // JS number, which cannot hold them.
  assert.equal(toPgText({ $decimal: "12345.67890123456789" }, num), "12345.67890123456789");
  assert.equal(toPgText({ $bytes: Buffer.from([0, 1, 250]).toString("base64") }, bytes), "\\x0001fa");
  assert.equal(toPgText({ $json: { a: [1, 2] } }, json), '{"a":[1,2]}');
  assert.equal(toPgText(true, bool), "true");
  assert.equal(toPgText({ $num: "NaN" }, { name: "c", udt: "float8", array: false }), "NaN");
});

test("array values become a Postgres array literal with quoting intact", () => {
  const arr = { name: "c", udt: "text", array: true };
  assert.equal(toPgText(["alpha", "beta"], arr), '{"alpha","beta"}');
  assert.equal(toPgText([], arr), "{}");
  assert.equal(toPgText(null, arr), null);
  // The two characters that would otherwise end an element early.
  assert.equal(toPgText(['say "hi"', "back\\slash"], arr), '{"say \\"hi\\"","back\\\\slash"}');
  assert.equal(toPgText(["a", null], arr), '{"a",NULL}');
});
