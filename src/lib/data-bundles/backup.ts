import "server-only";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { dataDb } from "@/lib/data-db";
import {
  BACKUP_APP,
  BACKUP_CONTENT_TYPE,
  BACKUP_EXCLUDED_TABLES,
  BACKUP_FORMAT_ID,
  BACKUP_FORMAT_NAME,
  BACKUP_FORMAT_VERSION,
  backupFileName,
  backupKindLabel,
  backupStatusLabel,
  buildBackupId,
  encodeBackupValue,
  isJsonColumn,
  type BackupColumn,
  type BackupFooter,
  type BackupHeader,
  type BackupTableCount,
} from "@/lib/data-bundles/backup-format";
import { backupScope } from "@/lib/data-bundles/backup-scope";
import {
  backupTargets,
  deleteBackupFile,
  getBackupFile,
  hasOffsiteBackupStorage,
  putBackupFile,
  type BackupLocation,
  type BackupTarget,
} from "@/lib/data-bundles/backup-storage";

/**
 * Full-database backup for the Data Bundles business.
 *
 * Scope is the thing to be careful about here: every query in this file runs
 * through `dataDb`, the client bound to DATA_DATABASE_URL. The retail mall has
 * its own client and its own database and is not touched, read, or named by
 * anything below.
 *
 * What a snapshot contains is decided by the database, not by this file. The
 * table list comes out of the Postgres catalog, so a table added to
 * prisma/data/schema.prisma next month is in the next backup without anyone
 * remembering to come back here — which is the failure mode a hand-kept list
 * of models has, and the one that loses data quietly. Four tables are skipped
 * by name and the reasons are in backup-format.ts, and when the bundle tables
 * still share the retail database the catalog is narrowed to this schema's own
 * (see backup-scope.ts) — "every table here" is the wrong answer in a database
 * that is also the mall.
 *
 * What it never contains: anything from the environment. There is no path from
 * here to `process.env` other than the connection URL itself, and the only
 * thing derived from that is a host-and-database label with the user,
 * password and query string stripped off. API keys, Paystack secrets and
 * database passwords live in the environment and stay there.
 *
 * The whole dump runs inside one REPEATABLE READ transaction, so the orders in
 * the snapshot and the ledger rows that explain them are from the same instant
 * rather than from whenever each table's turn came round.
 */

/** Rows fetched per round trip. Big enough to be few queries, small enough to not spike memory. */
const ROW_BATCH = 2_000;

/** How long the dump transaction may run before Prisma gives up on it. */
const TX_TIMEOUT_MS = 5 * 60_000;
const TX_MAX_WAIT_MS = 15_000;

/**
 * A ceiling on the uncompressed dump, so a runaway table fails the backup
 * instead of the process. Raise it with DATA_BACKUP_MAX_BYTES when the
 * business legitimately outgrows it.
 */
function maxUncompressedBytes(): number {
  const configured = Number(process.env.DATA_BACKUP_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 512 * 1024 * 1024;
}

/**
 * Two-part advisory lock id, held for the length of the dump transaction and
 * released when it ends — including when it ends badly. Two admins pressing
 * the button at once would otherwise hold two long transactions open against a
 * small connection pool.
 */
const BACKUP_LOCK = [4711, 2028] as const;

export interface DataBackupSummary {
  id: string;
  kind: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  format: string;
  fileName: string;
  tableCount: number;
  recordCount: number;
  byteSize: number;
  checksum: string;
  databaseId: string;
  schemaVersion: string;
  appVersion: string;
  /** The driver a download reads from first. */
  storage: string;
  storageLabel: string;
  locations: BackupLocation[];
  manifest: BackupTableCount[];
  error: string | null;
  durationMs: number;
  createdByEmail: string;
  startedAt: Date;
  completedAt: Date | null;
  /** True when a stored copy still exists to hand over. */
  downloadable: boolean;
}

export interface BackupOverview {
  /** False when the history table isn't there yet (before the migration runs). */
  available: boolean;
  targets: BackupTarget[];
  /** True once at least one copy lands off this server. */
  offsite: boolean;
  latest: DataBackupSummary | null;
  /** The last one that actually completed — not the same thing as the latest. */
  lastGood: DataBackupSummary | null;
  totalBackups: number;
  totalBytes: number;
}

export type CreateBackupResult =
  | { ok: true; backup: DataBackupSummary; warning?: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Identity of the database being backed up
// ---------------------------------------------------------------------------

/**
 * A label for the database a snapshot came from, with every secret removed.
 *
 * Deliberately built by hand rather than by printing the URL: a connection
 * string carries the user and password, and a backup's metadata is exactly the
 * sort of thing that gets pasted into a support thread.
 */
function databaseLabel(databaseName: string): string {
  const url = process.env.DATA_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  let host = "unknown-host";
  if (url) {
    try {
      host = new URL(url).hostname || host;
    } catch {
      // An unparseable URL tells us nothing; the database name still does.
    }
  }
  return `${databaseName}@${host}`;
}

/** The build that took the snapshot, as far as the host will tell us. */
function appVersion(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim();
  return sha ? sha.slice(0, 12) : "dev";
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * A name for the paging cursor's output column that no column of this table
 * already uses, so reading it back cannot pick up a real value by accident.
 */
function freeAlias(columns: BackupColumn[]): string {
  const taken = new Set(columns.map((c) => c.name));
  let alias = "__niki_ctid";
  while (taken.has(alias)) alias += "_";
  return alias;
}

// ---------------------------------------------------------------------------
// Reading the catalog
// ---------------------------------------------------------------------------

interface TableShape {
  name: string;
  columns: BackupColumn[];
}

/**
 * Every table in this database that belongs to the bundle business, with its
 * columns, straight from the catalog.
 *
 * `relkind = 'r'` is a real table that physically holds rows: views, sequences,
 * indexes and foreign tables have nothing of their own to back up. Partitions
 * are included — they are `'r'` too — and their parent (`'p'`) is left out,
 * because the parent holds no rows itself and reading both would dump
 * everything twice. Nothing in this schema is partitioned today; the rule is
 * written this way so that the day something is, its rows are captured rather
 * than quietly missed.
 */
async function describeTables(tx: RawClient): Promise<TableShape[]> {
  const tableRows = await tx.$queryRawUnsafe<{ name: string }[]>(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  // `backupScope` is what keeps a shared database honest: with
  // DATA_DATABASE_URL unset, `dataDb` is the retail database too, and
  // everything in `public` would mean the whole mall.
  const scope = backupScope();
  const wanted = tableRows.map((r) => r.name).filter((name) => scope.includes(name));
  if (wanted.length === 0) return [];

  const columnRows = await tx.$queryRawUnsafe<
    { table_name: string; column_name: string; udt_name: string; data_type: string }[]
  >(`
    SELECT table_name, column_name, udt_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const byTable = new Map<string, BackupColumn[]>();
  for (const row of columnRows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
    byTable.get(row.table_name)!.push({
      name: row.column_name,
      // An array column's udt_name is the element type prefixed with "_";
      // strip it and record the arrayness separately so a restore can rebuild
      // the type without re-parsing the name.
      udt: row.data_type === "ARRAY" ? row.udt_name.replace(/^_/, "") : row.udt_name,
      array: row.data_type === "ARRAY",
    });
  }

  return wanted
    .map((name) => ({ name, columns: byTable.get(name) ?? [] }))
    // A table with no columns cannot hold anything; including it would only
    // produce an empty table line.
    .filter((t) => t.columns.length > 0);
}

/** The narrow slice of the Prisma client this module needs, transaction or not. */
type RawClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

// ---------------------------------------------------------------------------
// Taking a backup
// ---------------------------------------------------------------------------

/**
 * Take a full snapshot of the Data Bundles database and store it.
 *
 * The caller is responsible for authorisation — `createDataBackup` in
 * backup-actions.ts is the only entry point and it starts with `requireAdmin`.
 */
export async function runDataBackup(options: {
  kind?: string;
  byId?: string;
  byEmail?: string;
}): Promise<CreateBackupResult> {
  const kind = options.kind ?? "manual";
  const startedAt = new Date();
  const id = buildBackupId(startedAt, randomBytes(4).toString("hex"));
  const fileName = backupFileName(id);
  const started = Date.now();

  if (backupTargets().length === 0) {
    return {
      ok: false,
      error:
        "No backup storage is configured, so there would be nowhere to put the file. Set DATA_BACKUP_S3_* for cloud storage or DATA_BACKUP_LOCAL_DIR for a directory on the server.",
    };
  }

  // The row goes in before the work starts, so a crash halfway through a dump
  // leaves a "running" row an admin can see rather than no trace at all.
  try {
    await dataDb.dataBackup.create({
      data: {
        id,
        kind,
        status: "running",
        format: BACKUP_FORMAT_ID,
        fileName,
        appVersion: appVersion(),
        createdById: options.byId ?? "",
        createdByEmail: options.byEmail ?? "",
        startedAt,
      },
    });
  } catch (error) {
    console.error("[data-backup] could not open a history row", error);
    return {
      ok: false,
      error:
        "Could not write to the backup history table. If this is the first backup, deploy once so db/data-migrations/0018_backups.sql is applied.",
    };
  }

  let locations: BackupLocation[] = [];

  try {
    const dump = await buildDump({ id, kind, takenAt: startedAt });
    const body = gzipSync(dump.payload, { level: 9 });
    const checksum = createHash("sha256").update(body).digest("hex");

    locations = await putBackupFile(fileName, body, BACKUP_CONTENT_TYPE);
    const stored = locations.filter((l) => l.ok);
    if (stored.length === 0) {
      throw new Error(
        `The snapshot was taken but could not be stored. ${locations
          .map((l) => `${l.label}: ${l.error ?? "failed"}`)
          .join("; ")}`,
      );
    }

    // Off-host copy first: that is the one a download should prefer, because it
    // is the one that is still there when the server isn't.
    const primary = stored.find((l) => l.driver === "s3") ?? stored[0];

    const row = await dataDb.dataBackup.update({
      where: { id },
      data: {
        status: "completed",
        tableCount: dump.tables.length,
        recordCount: dump.recordCount,
        byteSize: body.byteLength,
        checksum,
        databaseId: dump.databaseId,
        schemaVersion: dump.schemaVersion,
        storage: primary.driver,
        storageKey: primary.key,
        storageTargets: JSON.stringify(locations),
        manifest: JSON.stringify(dump.tables),
        durationMs: Date.now() - started,
        completedAt: new Date(),
        error: null,
      },
    });

    const failed = locations.filter((l) => !l.ok);
    console.log(
      `[data-backup] ${id} completed — ${dump.tables.length} tables, ${dump.recordCount} rows, ${body.byteLength} bytes`,
    );

    return {
      ok: true,
      backup: toSummary(row),
      warning:
        failed.length > 0
          ? `Stored to ${primary.label}, but ${failed.map((f) => f.label).join(" and ")} failed.`
          : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[data-backup] ${id} failed`, error);
    // A half-written file is worse than none: it would sit in the history
    // looking downloadable.
    await deleteBackupFile(locations).catch(() => {});
    await dataDb.dataBackup
      .update({
        where: { id },
        data: {
          status: "failed",
          error: message.slice(0, 1000),
          durationMs: Date.now() - started,
          completedAt: new Date(),
          storageTargets: JSON.stringify([]),
        },
      })
      .catch(() => {});
    return { ok: false, error: message };
  }
}

interface Dump {
  payload: Buffer;
  tables: BackupTableCount[];
  recordCount: number;
  databaseId: string;
  schemaVersion: string;
}

/**
 * Read every table and assemble the NDJSON body.
 *
 * One transaction for the whole read, at REPEATABLE READ: every table is seen
 * as it was at the same instant, so an order written while the dump was
 * running cannot appear without the ledger row that pays for it. Read
 * committed — Prisma's default — would give each statement its own snapshot
 * and allow exactly that.
 */
async function buildDump(meta: { id: string; kind: string; takenAt: Date }): Promise<Dump> {
  // Read outside the transaction, deliberately. In Postgres a statement that
  // errors aborts the whole transaction, and every statement after it fails
  // with 25P02 no matter what JavaScript does with the exception — so a
  // `try`/`catch` around a query *inside* the dump transaction does not
  // tolerate anything, it just hides which statement killed the backup. This
  // lookup is the one that is allowed to fail (a database migrated by some
  // other means has no ledger), so it happens first, on its own connection.
  const schemaVersion = await lastMigration();

  return dataDb.$transaction(
    async (tx) => {
      const locked = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
        `SELECT pg_try_advisory_xact_lock(${BACKUP_LOCK[0]}, ${BACKUP_LOCK[1]}) AS locked`,
      );
      if (!locked[0]?.locked) {
        throw new Error("Another backup is already running. Wait for it to finish and try again.");
      }

      const [{ name: databaseName }] = await tx.$queryRawUnsafe<{ name: string }[]>(
        `SELECT current_database() AS name`,
      );
      const databaseId = databaseLabel(databaseName);
      const tables = await describeTables(tx);

      const header: BackupHeader = {
        kind: "header",
        app: BACKUP_APP,
        format: BACKUP_FORMAT_NAME,
        formatVersion: BACKUP_FORMAT_VERSION,
        id: meta.id,
        takenAt: meta.takenAt.toISOString(),
        backupKind: meta.kind,
        databaseId,
        schemaVersion,
        appVersion: appVersion(),
        excludedTables: [...BACKUP_EXCLUDED_TABLES],
        scope: backupScope().reason,
      };

      const chunks: Buffer[] = [];
      let bytes = 0;
      const push = (line: unknown) => {
        const buf = Buffer.from(`${JSON.stringify(line)}\n`, "utf8");
        bytes += buf.byteLength;
        if (bytes > maxUncompressedBytes()) {
          throw new Error(
            "The snapshot exceeded the configured size limit. Raise DATA_BACKUP_MAX_BYTES or move to a streaming backup.",
          );
        }
        chunks.push(buf);
      };

      push(header);

      const counts: BackupTableCount[] = [];
      let recordCount = 0;

      for (const table of tables) {
        push({ kind: "table", name: table.name, columns: table.columns });

        const jsonFlags = table.columns.map(isJsonColumn);
        const selectList = table.columns.map((c) => quoteIdent(c.name)).join(", ");
        /*
         * Paged on `ctid` — the physical row address — rather than on a
         * primary key or an OFFSET.
         *
         * Not a key, because the table list comes from the catalog and nothing
         * guarantees a future table has one. Not an OFFSET, because
         * `OFFSET 400000` makes Postgres walk and discard four hundred
         * thousand rows every batch, which turns a big ledger into a
         * quadratic scan. A `ctid >` cursor is a TID range scan: each batch
         * starts where the last one stopped.
         *
         * Safe inside this transaction because REPEATABLE READ pins the
         * snapshot: no row we have already passed can move behind the cursor.
         *
         * Two details that are easy to get wrong, and were:
         *
         *   - The cursor is cast to text, because Prisma's raw driver has no
         *     mapping for the `tid` type and fails the entire query rather
         *     than the one column.
         *   - That cast must NOT be aliased `ctid`. `ORDER BY ctid` would then
         *     bind to the text output column instead of the system column, and
         *     text order puts block 10 before block 2 while `ctid >` compares
         *     numerically — so each batch skipped whatever did not sort the way
         *     the cursor expected. It silently lost rows, which is the one bug
         *     a backup must not have. The alias is kept clear of the table's
         *     own column names instead.
         */
        const cursorAlias = freeAlias(table.columns);
        const base = `SELECT ctid::text AS ${quoteIdent(cursorAlias)}, ${selectList} FROM ${quoteIdent(table.name)}`;
        const tail = ` ORDER BY ctid LIMIT ${ROW_BATCH}`;

        let cursor: string | null = null;
        let rows = 0;
        for (;;) {
          const where: string = cursor ? ` WHERE ctid > '${cursor}'::tid` : "";
          const batch: Record<string, unknown>[] = await tx.$queryRawUnsafe(
            `${base}${where}${tail}`,
          );
          if (batch.length === 0) break;
          for (const row of batch) {
            // One known limit, worth writing down: Prisma's driver turns a
            // non-finite `double precision` (NaN, ±Infinity) into null before
            // this code sees it. Nothing in this schema can hold one — every
            // float here is money the app wrote from a JS number — and the
            // encoder tags them anyway, so the day a driver starts passing
            // them through, the format already carries them.
            push({
              kind: "row",
              t: table.name,
              v: table.columns.map((c, i) => encodeBackupValue(row[c.name], jsonFlags[i])),
            });
          }
          rows += batch.length;

          // The cursor comes back out of the database, but it is interpolated
          // into the next statement, so it is checked against the shape a tid
          // actually has before it goes anywhere near one.
          const last: string = String(batch[batch.length - 1][cursorAlias] ?? "");
          if (!/^\(\d+,\d+\)$/.test(last)) {
            throw new Error(`Unexpected row address while reading ${table.name}.`);
          }
          cursor = last;
          if (batch.length < ROW_BATCH) break;
        }

        counts.push({ table: table.name, rows });
        recordCount += rows;
      }

      const footer: BackupFooter = {
        kind: "footer",
        tables: counts,
        tableCount: counts.length,
        recordCount,
        finishedAt: new Date().toISOString(),
      };
      push(footer);

      return {
        payload: Buffer.concat(chunks),
        tables: counts,
        recordCount,
        databaseId,
        schemaVersion,
      };
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS, isolationLevel: "RepeatableRead" },
  );
}

/**
 * The last migration this database has applied — the closest thing it has to a
 * schema version, and what tells you whether a backup predates a column.
 *
 * The ledger's existence is checked with `to_regclass`, which answers NULL for
 * a relation that is not there instead of raising: a database set up with
 * `prisma db push`, or migrated by hand, simply has no `_NikiMigration`, and
 * that is not a reason to fail a backup.
 */
async function lastMigration(): Promise<string> {
  try {
    const [{ present }] = await dataDb.$queryRawUnsafe<{ present: boolean }[]>(
      `SELECT to_regclass('public."_NikiMigration"') IS NOT NULL AS present`,
    );
    if (!present) return "unknown";
    const rows = await dataDb.$queryRawUnsafe<{ name: string }[]>(
      `SELECT "name" FROM "_NikiMigration" ORDER BY "name" DESC LIMIT 1`,
    );
    return rows[0]?.name ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Reading the history
// ---------------------------------------------------------------------------

type BackupRow = {
  id: string;
  kind: string;
  status: string;
  format: string;
  fileName: string;
  tableCount: number;
  recordCount: number;
  byteSize: number;
  checksum: string;
  databaseId: string;
  schemaVersion: string;
  appVersion: string;
  storage: string;
  storageKey: string;
  storageTargets: string;
  manifest: string;
  error: string | null;
  durationMs: number;
  createdByEmail: string;
  startedAt: Date;
  completedAt: Date | null;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function toSummary(row: BackupRow): DataBackupSummary {
  const locations = parseJson<BackupLocation[]>(row.storageTargets, []);
  const usable = locations.filter((l) => l.ok && l.key);
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: backupKindLabel(row.kind),
    status: row.status,
    statusLabel: backupStatusLabel(row.status),
    format: row.format,
    fileName: row.fileName,
    tableCount: row.tableCount,
    recordCount: row.recordCount,
    byteSize: row.byteSize,
    checksum: row.checksum,
    databaseId: row.databaseId,
    schemaVersion: row.schemaVersion,
    appVersion: row.appVersion,
    storage: row.storage,
    storageLabel: usable[0]?.label ?? (row.storage === "none" ? "—" : row.storage),
    locations,
    manifest: parseJson<BackupTableCount[]>(row.manifest, []),
    error: row.error,
    durationMs: row.durationMs,
    createdByEmail: row.createdByEmail,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    downloadable: row.status === "completed" && usable.length > 0,
  };
}

/** Backup history, newest first. */
export async function listDataBackups(limit = 50): Promise<DataBackupSummary[]> {
  try {
    const rows = await dataDb.dataBackup.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map(toSummary);
  } catch {
    // Before the migration lands there is no table. The console should say so
    // rather than fall over.
    return [];
  }
}

/** The status panel at the top of the Backups tab. */
export async function getBackupOverview(): Promise<BackupOverview> {
  const targets = backupTargets();
  const offsite = hasOffsiteBackupStorage();

  try {
    const [latest, lastGood, totals] = await Promise.all([
      dataDb.dataBackup.findFirst({ orderBy: { startedAt: "desc" } }),
      dataDb.dataBackup.findFirst({
        where: { status: "completed" },
        orderBy: { startedAt: "desc" },
      }),
      dataDb.dataBackup.aggregate({
        _count: { _all: true },
        _sum: { byteSize: true },
        where: { status: "completed" },
      }),
    ]);

    return {
      available: true,
      targets,
      offsite,
      latest: latest ? toSummary(latest) : null,
      lastGood: lastGood ? toSummary(lastGood) : null,
      totalBackups: totals._count._all,
      totalBytes: totals._sum.byteSize ?? 0,
    };
  } catch {
    return {
      available: false,
      targets,
      offsite,
      latest: null,
      lastGood: null,
      totalBackups: 0,
      totalBytes: 0,
    };
  }
}

/**
 * Fetch a stored backup for download, verifying it on the way out.
 *
 * The checksum is recomputed over the bytes we actually read rather than
 * trusted: a backup you cannot verify is a backup you do not have, and the
 * moment to discover a truncated upload is now, not during a restore. The
 * check is handed to `getBackupFile` so that a corrupt primary copy falls
 * through to the other target instead of failing the download outright.
 */
export async function readDataBackup(
  id: string,
): Promise<
  | { ok: true; fileName: string; body: Buffer }
  | { ok: false; status: number; error: string }
> {
  let row: BackupRow | null;
  try {
    row = await dataDb.dataBackup.findUnique({ where: { id } });
  } catch {
    return { ok: false, status: 503, error: "The backup history is unavailable." };
  }

  if (!row) return { ok: false, status: 404, error: "No such backup." };
  if (row.status !== "completed") {
    return { ok: false, status: 409, error: `This backup is ${row.status}, so there is no file.` };
  }

  const summary = toSummary(row);
  const fetched = await getBackupFile(summary.locations, checksumVerifier(summary.checksum));

  if (fetched.ok) {
    return { ok: true, fileName: summary.fileName || backupFileName(id), body: fetched.body };
  }

  console.error(`[data-backup] ${id} download failed`, fetched.problems.join("; "));
  if (fetched.everyCopyFailedVerification) {
    return {
      ok: false,
      status: 500,
      error:
        "Every stored copy of this backup fails the checksum recorded when it was taken. They have been altered or truncated — do not restore from them.",
    };
  }
  return { ok: false, status: 500, error: `Could not read the backup file. ${fetched.problems.join("; ")}` };
}

/**
 * A checksum check for `getBackupFile`, or nothing when the row predates
 * checksums — in which case the file is handed over unverified rather than
 * made undownloadable.
 */
export function checksumVerifier(expected: string): ((body: Buffer) => boolean) | undefined {
  if (!expected) return undefined;
  return (body) => createHash("sha256").update(body).digest("hex") === expected;
}
