/**
 * The Data Bundles backup file format.
 *
 * A backup has one job: to still be restorable when everything that produced
 * it is gone. So this is not a spreadsheet of the columns that happened to fit
 * on screen — it is every row of every table, with enough type information to
 * put each value back exactly as Postgres gave it to us.
 *
 * The file is gzipped NDJSON: one JSON object per line, which means a reader
 * never has to hold the whole snapshot in memory and a truncated file is
 * detectable (the footer is missing) rather than silently half-valid.
 *
 *   {"kind":"header", …}                      ← what, when, from where
 *   {"kind":"table","name":"DataOrder", …}    ← columns and their Postgres types
 *   {"kind":"row","t":"DataOrder","v":[…]}    ← values, in column order
 *   …
 *   {"kind":"footer","tables":[…], …}         ← per-table counts, written last
 *
 * Values are arrays rather than objects because the column names are already
 * on the table line, and repeating 40 keys per row triples the file for
 * nothing.
 *
 * This module is pure — no database, no filesystem, no `server-only` — so the
 * encoding can be tested on its own and a future restore can reuse exactly the
 * decoder that matches this encoder.
 */

export const BACKUP_APP = "nickimart-data-bundles";
export const BACKUP_FORMAT_NAME = "nickimart-data-backup";
export const BACKUP_FORMAT_VERSION = 1;
/** Written into the file and into the history row, e.g. "nickimart-data-backup/1". */
export const BACKUP_FORMAT_ID = `${BACKUP_FORMAT_NAME}/${BACKUP_FORMAT_VERSION}`;
export const BACKUP_FILE_EXTENSION = ".nmbak.gz";
export const BACKUP_CONTENT_TYPE = "application/gzip";

/**
 * Tables that are never part of a snapshot, by exact name.
 *
 * The two migration ledgers are the schema's own bookkeeping: restoring them
 * would tell a database it had already run migrations it has not run, or that
 * it still needs ones it has. `DataBackup` is the backup history itself —
 * rolling that back with a restore would erase the record of the restore, and
 * of the safety backup taken just before it.
 *
 * Everything else in the `public` schema is discovered from the catalog at
 * backup time, so a table added next month is included without anyone
 * remembering to edit a list.
 */
export const BACKUP_EXCLUDED_TABLES = ["_prisma_migrations", "_NikiMigration", "DataBackup"] as const;

export function isExcludedFromBackup(table: string): boolean {
  return (BACKUP_EXCLUDED_TABLES as readonly string[]).includes(table);
}

// ---------------------------------------------------------------------------
// Shape of the file
// ---------------------------------------------------------------------------

/** One column, as the Postgres catalog describes it. */
export interface BackupColumn {
  name: string;
  /** Postgres underlying type name, e.g. "text", "int8", "timestamp", "jsonb". */
  udt: string;
  /** True for array columns (`text[]`), whose `udt` is the element type. */
  array: boolean;
}

export interface BackupHeader {
  kind: "header";
  app: typeof BACKUP_APP;
  format: string;
  formatVersion: number;
  /** Backup id, matching the history row and the file name. */
  id: string;
  /** ISO timestamp the snapshot started. */
  takenAt: string;
  /** manual | safety | auto-daily | auto-weekly | auto-monthly. */
  backupKind: string;
  /** "<database>@<host>" — never a credential. */
  databaseId: string;
  /** Last migration applied when the snapshot was taken. */
  schemaVersion: string;
  /** The build that took it. */
  appVersion: string;
  /** Tables deliberately left out, for the reader's benefit. */
  excludedTables: string[];
}

export interface BackupTableLine {
  kind: "table";
  name: string;
  columns: BackupColumn[];
}

export interface BackupRowLine {
  kind: "row";
  t: string;
  v: unknown[];
}

export interface BackupTableCount {
  table: string;
  rows: number;
}

export interface BackupFooter {
  kind: "footer";
  tables: BackupTableCount[];
  tableCount: number;
  recordCount: number;
  /** ISO timestamp the dump finished. */
  finishedAt: string;
}

export type BackupLine = BackupHeader | BackupTableLine | BackupRowLine | BackupFooter;

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * Whether a column holds arbitrary JSON.
 *
 * This is the one distinction the encoder has to make. Everything else that
 * comes back from Postgres is a scalar, a Date, a Buffer, a Decimal, or an
 * array of those — all of which the tagged encoding below covers without
 * ambiguity. A `jsonb` column, on the other hand, can legitimately contain an
 * object whose key is `$date`, which would be indistinguishable from one of
 * our own tags. So JSON values are wrapped once, in `{"$json": …}`, and passed
 * through untouched inside that wrapper.
 */
export function isJsonColumn(column: BackupColumn): boolean {
  return !column.array && (column.udt === "json" || column.udt === "jsonb");
}

/** A `Decimal` from Prisma, duck-typed — the class itself isn't exported here. */
function isDecimalLike(value: object): value is { toString(): string } {
  return (
    "s" in value &&
    "e" in value &&
    "d" in value &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Turn one value from a raw query into something `JSON.stringify` can write
 * and `decodeBackupValue` can turn back into the same thing.
 *
 * Postgres types that JSON has no idea about get a tag: `bigint` would throw
 * outright, a `Date` would stringify to a string indistinguishable from a text
 * column, `bytea` arrives as a Buffer, and `numeric` arrives as a Decimal
 * whose precision a JS number cannot hold. Tagging each one means a restore
 * can put back the type, not just the characters.
 */
export function encodeBackupValue(value: unknown, json: boolean): unknown {
  if (json) return value === null || value === undefined ? null : { $json: value };
  return encodeTagged(value);
}

function encodeTagged(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      // NaN and ±Infinity are legal in Postgres `double precision` and illegal
      // in JSON — `JSON.stringify` writes them as `null`, which would turn a
      // real value into a missing one. Tag them instead.
      return Number.isFinite(value) ? value : { $num: String(value) };
    case "bigint":
      return { $bigint: value.toString() };
    default:
      break;
  }

  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map(encodeTagged);
  }
  if (typeof value === "object") {
    if (isDecimalLike(value)) return { $decimal: value.toString() };
    // An unexpected object type (a Postgres range, an interval). Keep the text
    // rather than dropping the row: a restore can still put the characters
    // back, and the alternative is losing data silently.
    return { $text: String(value) };
  }
  return String(value);
}

/**
 * The inverse of `encodeBackupValue`. Used by the restore path, and by the
 * tests that keep the two honest about each other.
 */
export function decodeBackupValue(value: unknown, json: boolean): unknown {
  if (json) {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value !== null && "$json" in value) {
      return (value as { $json: unknown }).$json;
    }
    return value;
  }
  return decodeTagged(value);
}

function decodeTagged(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(decodeTagged);
  if (typeof value !== "object") return value;

  const tag = value as Record<string, unknown>;
  if ("$date" in tag) return new Date(String(tag.$date));
  if ("$bigint" in tag) return BigInt(String(tag.$bigint));
  if ("$bytes" in tag) return Buffer.from(String(tag.$bytes), "base64");
  if ("$decimal" in tag) return String(tag.$decimal);
  if ("$num" in tag) return Number(tag.$num);
  if ("$text" in tag) return String(tag.$text);
  return value;
}

// ---------------------------------------------------------------------------
// Identifiers and file names
// ---------------------------------------------------------------------------

/** `20261008T143012Z` — sortable, filename-safe, no punctuation to escape. */
export function backupStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A backup id: `dbk_<stamp>_<random>`.
 *
 * The stamp makes a listing sort itself and makes a file recognisable without
 * opening it; the random suffix means two backups started in the same second
 * cannot collide. Restricted to characters that are safe in a filename, in a
 * URL path, and in an S3 key, so the same string can be all three.
 */
export function buildBackupId(at: Date, random: string): string {
  return `dbk_${backupStamp(at)}_${random.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
}

const ID_PATTERN = /^dbk_\d{8}T\d{6}Z_[a-z0-9]{1,8}$/;

/**
 * Whether a string is one of our backup ids.
 *
 * The download route takes an id straight from the URL and uses it to build a
 * storage key, so "looks like an id" is a security check, not a formality: it
 * is what stops `../` or an absolute path from escaping the backup directory.
 */
export function isBackupId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function backupFileName(id: string): string {
  return `${id}${BACKUP_FILE_EXTENSION}`;
}

// ---------------------------------------------------------------------------
// Display helpers (shared by the panel and the history table)
// ---------------------------------------------------------------------------

export const BACKUP_KIND_LABELS: Record<string, string> = {
  manual: "Manual",
  safety: "Pre-restore safety",
  "auto-daily": "Automatic — daily",
  "auto-weekly": "Automatic — weekly",
  "auto-monthly": "Automatic — monthly",
};

export const BACKUP_STATUS_LABELS: Record<string, string> = {
  running: "In progress",
  completed: "Completed",
  failed: "Failed",
};

export function backupKindLabel(kind: string): string {
  return BACKUP_KIND_LABELS[kind] ?? kind;
}

export function backupStatusLabel(status: string): string {
  return BACKUP_STATUS_LABELS[status] ?? status;
}

/** Bytes as something a person can read: "4.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

/** A duration in milliseconds as "1.4s" or "2m 05s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}s`;
}
