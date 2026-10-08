import { test } from "node:test";
import assert from "node:assert/strict";

const {
  backupFileName,
  buildBackupId,
  decodeBackupValue,
  encodeBackupValue,
  formatBytes,
  formatDuration,
  isBackupId,
  isExcludedFromBackup,
  isJsonColumn,
} = await import("./backup-format.ts");

/**
 * A backup is only worth taking if it can be read back. These tests guard the
 * two properties that decide that: every Postgres value survives the round
 * trip with its type, and an id from a URL cannot be anything but an id.
 *
 * Run with: npm test
 */

function roundTrip(value: unknown, json = false): unknown {
  // Through real JSON, because that is what the file is — a value that encodes
  // to something JSON.stringify mangles has not survived anything.
  const encoded = JSON.parse(JSON.stringify(encodeBackupValue(value, json)));
  return decodeBackupValue(encoded, json);
}

test("strings, numbers, booleans and nulls come back unchanged", () => {
  assert.equal(roundTrip("NKM4821"), "NKM4821");
  assert.equal(roundTrip(12.5), 12.5);
  assert.equal(roundTrip(0), 0);
  assert.equal(roundTrip(true), true);
  assert.equal(roundTrip(false), false);
  assert.equal(roundTrip(null), null);
  assert.equal(roundTrip(undefined), null);
});

test("a timestamp comes back as a Date, not a string", () => {
  const when = new Date("2026-03-04T09:12:33.421Z");
  const back = roundTrip(when);
  assert.ok(back instanceof Date);
  assert.equal((back as Date).toISOString(), when.toISOString());
});

test("a bigint survives, which JSON alone cannot do", () => {
  // JSON.stringify throws outright on a bigint; an untagged dump of a bigserial
  // column would take the whole backup down.
  // Written through the constructor rather than as a literal: the build targets
  // ES2017, where `123n` is a syntax error.
  const value = BigInt("9007199254740993");
  assert.equal(roundTrip(value), value);
});

test("bytea comes back as the same bytes", () => {
  const bytes = Buffer.from([0, 1, 2, 250, 255]);
  const back = roundTrip(bytes);
  assert.ok(Buffer.isBuffer(back));
  assert.equal(Buffer.compare(back as Buffer, bytes), 0);
});

test("NaN and Infinity are kept rather than turned into null", () => {
  // Legal in Postgres `double precision`, and JSON writes both as `null` —
  // which would quietly replace a real reading with a missing one.
  assert.ok(Number.isNaN(roundTrip(Number.NaN)));
  assert.equal(roundTrip(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  assert.equal(roundTrip(Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
});

test("an array column keeps its elements and their types", () => {
  const when = new Date("2026-01-01T00:00:00.000Z");
  const back = roundTrip(["a", "b"]) as string[];
  assert.deepEqual(back, ["a", "b"]);
  const dates = roundTrip([when]) as Date[];
  assert.ok(dates[0] instanceof Date);
  assert.equal(dates[0].toISOString(), when.toISOString());
});

test("JSON columns pass through, even when they contain our own tag names", () => {
  // The reason json columns are wrapped: a jsonb value may legitimately hold a
  // key called "$date", and an unwrapped encoding could not tell it apart from
  // an encoded timestamp.
  const payload = { $date: "not a date", nested: { $bytes: "not bytes" }, list: [1, 2, 3] };
  assert.deepEqual(roundTrip(payload, true), payload);
  assert.equal(roundTrip(null, true), null);
});

test("only json and jsonb columns are treated as JSON", () => {
  assert.equal(isJsonColumn({ name: "meta", udt: "jsonb", array: false }), true);
  assert.equal(isJsonColumn({ name: "meta", udt: "json", array: false }), true);
  assert.equal(isJsonColumn({ name: "name", udt: "text", array: false }), false);
  // An array of json is an array first: its elements are encoded one by one.
  assert.equal(isJsonColumn({ name: "metas", udt: "jsonb", array: true }), false);
});

test("the migration ledgers and the backup history are never dumped", () => {
  assert.equal(isExcludedFromBackup("_prisma_migrations"), true);
  assert.equal(isExcludedFromBackup("_NikiMigration"), true);
  // Restoring backup history would erase the record of the safety backup taken
  // moments before the restore.
  assert.equal(isExcludedFromBackup("DataBackup"), true);
  assert.equal(isExcludedFromBackup("DataOrder"), false);
  assert.equal(isExcludedFromBackup("DataAgentLedger"), false);
});

test("a backup id is sortable, and a file name is built from it", () => {
  const id = buildBackupId(new Date("2026-10-08T14:30:12.000Z"), "AB12cd34");
  assert.equal(id, "dbk_20261008T143012Z_ab12cd34");
  assert.equal(backupFileName(id), "dbk_20261008T143012Z_ab12cd34.nmbak.gz");
  const later = buildBackupId(new Date("2026-10-09T00:00:00.000Z"), "ffffffff");
  assert.ok(later > id, "ids sort chronologically as plain strings");
});

test("only a real id passes validation — the download route builds a path from it", () => {
  assert.equal(isBackupId("dbk_20261008T143012Z_ab12cd34"), true);
  // Anything that could escape a backup directory or an object prefix.
  assert.equal(isBackupId("../../etc/passwd"), false);
  assert.equal(isBackupId("dbk_20261008T143012Z_ab12cd34/../x"), false);
  assert.equal(isBackupId("dbk_20261008T143012Z_"), false);
  assert.equal(isBackupId("dbk_bad_ab12cd34"), false);
  assert.equal(isBackupId(""), false);
  assert.equal(isBackupId(undefined), false);
  assert.equal(isBackupId(42), false);
});

test("sizes and durations read the way a person would say them", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(4 * 1024 * 1024), "4.0 MB");
  assert.equal(formatDuration(0), "—");
  assert.equal(formatDuration(850), "850ms");
  assert.equal(formatDuration(1400), "1.4s");
  assert.equal(formatDuration(125_000), "2m 05s");
});
