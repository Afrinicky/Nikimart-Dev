import { gunzipSync } from "node:zlib";
import {
  BACKUP_APP,
  BACKUP_FORMAT_NAME,
  BACKUP_FORMAT_VERSION,
  decodeBackupValue,
  isJsonColumn,
  type BackupColumn,
  type BackupTableCount,
} from "./backup-format.ts";

/**
 * Reading a backup file back.
 *
 * This is the half of the format that has to be suspicious. A file reaching
 * `parseBackupFile` has been uploaded by someone, has travelled through a
 * laptop and an email client, and is about to decide what the entire bundle
 * database contains — so it is treated as hostile input until every one of
 * these has passed:
 *
 *   - it decompresses within a fixed ceiling, so a 2 KB upload cannot expand
 *     into gigabytes and take the server down (`maxOutputLength`, not a check
 *     afterwards: by then the memory is already gone);
 *   - it is our format, our app, and a version we know how to read;
 *   - every table and column name matches a plain identifier pattern, because
 *     those names are about to be written into SQL;
 *   - every row belongs to a table that was declared, with exactly as many
 *     values as that table has columns;
 *   - the footer exists — which is what tells a truncated upload apart from a
 *     small database — and its counts match the rows actually present.
 *
 * Kept free of the database and of `server-only` so the validation can be
 * tested directly, which is the only way to be sure the rejections are real.
 */

/** Ceiling on the decompressed file. Generous for this business, fatal to a zip bomb. */
const MAX_UNCOMPRESSED = 1024 * 1024 * 1024;

/** A single line longer than this is not a row, it is an attack or a corruption. */
const MAX_LINE = 32 * 1024 * 1024;

/**
 * Postgres identifiers as this schema uses them. Deliberately narrower than
 * what Postgres allows: these names go into SQL, and a name needing anything
 * outside this set is a reason to stop rather than a reason to quote harder.
 */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface BackupFileTable {
  name: string;
  columns: BackupColumn[];
  /** Row values, still encoded. Decoded per column at restore time. */
  rows: unknown[][];
}

export interface BackupFileMeta {
  id: string;
  takenAt: Date;
  backupKind: string;
  databaseId: string;
  schemaVersion: string;
  appVersion: string;
  format: string;
  formatVersion: number;
  excludedTables: string[];
  tableCount: number;
  recordCount: number;
  counts: BackupTableCount[];
}

export interface ParsedBackup {
  meta: BackupFileMeta;
  tables: BackupFileTable[];
}

export class BackupFileError extends Error {}

function reject(message: string): never {
  throw new BackupFileError(message);
}

/**
 * Decompress, parse and validate a backup file.
 *
 * Returns the whole thing in memory. That is the right trade here: a restore
 * has to be all-or-nothing, so it cannot begin writing before the last line
 * has been read and found sound.
 */
export function parseBackupFile(file: Buffer): ParsedBackup {
  let text: string;
  try {
    text = gunzipSync(file, { maxOutputLength: MAX_UNCOMPRESSED }).toString("utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/maxOutputLength|buffer/i.test(message)) {
      reject("This file expands to more than the restore size limit. It is not a backup we wrote.");
    }
    reject("This file is not a gzipped Nickimart backup — it could not be decompressed.");
  }

  const lines = text.split("\n");
  let header: Record<string, unknown> | null = null;
  let footer: Record<string, unknown> | null = null;
  const tables: BackupFileTable[] = [];
  const byName = new Map<string, BackupFileTable>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (raw.length > MAX_LINE) reject(`Line ${i + 1} is implausibly long for a backup.`);
    if (footer) reject("There is content after the end of the backup. The file has been altered.");

    let line: Record<string, unknown>;
    try {
      line = JSON.parse(raw);
    } catch {
      reject(`Line ${i + 1} is not valid JSON. The file is corrupt or not a backup.`);
    }
    if (!line || typeof line !== "object") reject(`Line ${i + 1} is not a backup record.`);

    switch (line.kind) {
      case "header":
        if (header) reject("The file has more than one header.");
        if (tables.length > 0) reject("The header is not the first line of the file.");
        header = line;
        break;
      case "table":
        if (!header) reject("The file begins with a table rather than a header.");
        tables.push(readTableLine(line, byName));
        break;
      case "row": {
        if (!header) reject("The file begins with a row rather than a header.");
        const table = byName.get(String(line.t));
        if (!table) reject(`A row names a table (${String(line.t)}) the file never declared.`);
        if (!Array.isArray(line.v)) reject(`A row in ${table.name} carries no values.`);
        if (line.v.length !== table.columns.length) {
          reject(
            `A row in ${table.name} has ${line.v.length} values but the table declares ${table.columns.length} columns.`,
          );
        }
        table.rows.push(line.v);
        break;
      }
      case "footer":
        footer = line;
        break;
      default:
        reject(`Line ${i + 1} is a kind of record this version does not understand.`);
    }
  }

  if (!header) reject("The file has no header. It is not a Nickimart backup.");
  // The footer is written last, so its absence is how a transfer that stopped
  // halfway is told apart from a database that is simply small.
  if (!footer) reject("The file has no footer, which means it was never finished or was truncated.");

  const meta = readHeader(header, footer, tables);
  return { meta, tables };
}

function readTableLine(
  line: Record<string, unknown>,
  byName: Map<string, BackupFileTable>,
): BackupFileTable {
  const name = String(line.name ?? "");
  if (!IDENT.test(name)) reject(`"${name}" is not a table name this restore will accept.`);
  if (byName.has(name)) reject(`The file declares ${name} twice.`);
  if (!Array.isArray(line.columns) || line.columns.length === 0) {
    reject(`${name} is declared with no columns.`);
  }

  const columns: BackupColumn[] = line.columns.map((c: unknown) => {
    const col = (c ?? {}) as Record<string, unknown>;
    const colName = String(col.name ?? "");
    const udt = String(col.udt ?? "");
    if (!IDENT.test(colName)) reject(`${name} has a column name this restore will not accept.`);
    if (!IDENT.test(udt)) reject(`${name}.${colName} has a type name this restore will not accept.`);
    return { name: colName, udt, array: Boolean(col.array) };
  });

  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c.name)) reject(`${name} declares the column ${c.name} twice.`);
    seen.add(c.name);
  }

  const table: BackupFileTable = { name, columns, rows: [] };
  byName.set(name, table);
  return table;
}

function readHeader(
  header: Record<string, unknown>,
  footer: Record<string, unknown>,
  tables: BackupFileTable[],
): BackupFileMeta {
  if (header.app !== BACKUP_APP) {
    reject("This backup was not written by Nickimart Data Bundles. Restoring it is not possible.");
  }
  if (header.format !== BACKUP_FORMAT_NAME) {
    reject(`Unknown backup format "${String(header.format)}".`);
  }
  const formatVersion = Number(header.formatVersion);
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    reject("The backup does not say which format version it is.");
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    // Forwards, not backwards: a newer file may use encodings this build has
    // never heard of, and guessing at them is how a restore corrupts data.
    reject(
      `This backup is format version ${formatVersion}; this version of Nickimart reads up to ${BACKUP_FORMAT_VERSION}. Deploy the newer build first.`,
    );
  }

  const takenAt = new Date(String(header.takenAt ?? ""));
  if (Number.isNaN(takenAt.getTime())) reject("The backup does not carry a valid date.");

  // Counted from the rows actually present rather than taken on trust: the
  // footer is the claim, and these are the facts.
  const counts: BackupTableCount[] = tables.map((t) => ({ table: t.name, rows: t.rows.length }));
  const recordCount = counts.reduce((sum, c) => sum + c.rows, 0);

  const claimedRecords = Number(footer.recordCount);
  const claimedTables = Number(footer.tableCount);
  if (Number.isFinite(claimedRecords) && claimedRecords !== recordCount) {
    reject(
      `The backup says it holds ${claimedRecords} records but ${recordCount} are present. The file is incomplete or altered.`,
    );
  }
  if (Number.isFinite(claimedTables) && claimedTables !== tables.length) {
    reject(
      `The backup says it holds ${claimedTables} tables but ${tables.length} are present. The file is incomplete or altered.`,
    );
  }
  if (Array.isArray(footer.tables)) {
    const claimed = new Map(
      (footer.tables as BackupTableCount[]).map((t) => [String(t.table), Number(t.rows)]),
    );
    for (const c of counts) {
      const want = claimed.get(c.table);
      if (want !== undefined && want !== c.rows) {
        reject(`${c.table} should hold ${want} rows but ${c.rows} are present.`);
      }
    }
  }

  return {
    id: String(header.id ?? ""),
    takenAt,
    backupKind: String(header.backupKind ?? "manual"),
    databaseId: String(header.databaseId ?? ""),
    schemaVersion: String(header.schemaVersion ?? ""),
    appVersion: String(header.appVersion ?? ""),
    format: String(header.format),
    formatVersion,
    excludedTables: Array.isArray(header.excludedTables)
      ? header.excludedTables.map(String)
      : [],
    tableCount: tables.length,
    recordCount,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Values, on the way back into Postgres
// ---------------------------------------------------------------------------

/**
 * A value as Postgres's own text input, to be handed to a cast.
 *
 * Every value goes back as text and is parsed by Postgres against the column's
 * real type, the way `COPY` and `pg_dump` do it. The alternative — letting the
 * driver infer a parameter type from the JavaScript value — gets `numeric`,
 * `uuid` and `jsonb` wrong in ways that either fail loudly or, worse, round a
 * number on the way in.
 */
export function toPgText(value: unknown, column: BackupColumn): string | null {
  const decoded = decodeBackupValue(value, isJsonColumn(column));
  if (decoded === null || decoded === undefined) return null;
  if (column.array) {
    if (!Array.isArray(decoded)) return null;
    return pgArrayLiteral(decoded);
  }
  if (isJsonColumn(column)) return JSON.stringify(decoded);
  return scalarText(decoded);
}

function scalarText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString("hex")}`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    // Postgres spells these exactly this way for float columns.
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return String(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** `{"a","b",NULL}` — the text form Postgres parses back into an array. */
function pgArrayLiteral(values: unknown[]): string {
  const parts = values.map((v) => {
    if (v === null || v === undefined) return "NULL";
    const text = scalarText(v);
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(",")}}`;
}
