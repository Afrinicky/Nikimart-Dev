import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { dataDb } from "@/lib/data-db";
import {
  backupKindLabel,
  backupStamp,
  isExcludedFromBackup,
  type BackupColumn,
} from "@/lib/data-bundles/backup-format";
import {
  BackupFileError,
  parseBackupFile,
  toPgText,
  type BackupFileMeta,
  type BackupFileTable,
} from "@/lib/data-bundles/backup-file";
import { getBackupFile, type BackupLocation } from "@/lib/data-bundles/backup-storage";
import { runDataBackup } from "@/lib/data-bundles/backup";

/**
 * Restoring the Data Bundles database from a backup.
 *
 * This is the one operation in the console that destroys data on purpose, so
 * the order of events is the design:
 *
 *   1. The file is read and validated in full before anything is written. A
 *      restore that fails halfway is worse than one that never started.
 *   2. The backup is compared against the live schema, and what does not line
 *      up is reported rather than guessed at.
 *   3. A safety backup of the current database is taken, and the restore stops
 *      if it fails. Whatever is about to be overwritten must be recoverable
 *      before it is overwritten — no exceptions, no override.
 *   4. The admin types the confirmation phrase.
 *   5. The write happens in one transaction: truncate, insert, verify. If any
 *      part of it fails the transaction rolls back and the database is exactly
 *      as it was.
 *   6. Row counts are re-read from the database afterwards and compared with
 *      the backup's own manifest, so "restored" means verified rather than
 *      "the inserts did not throw".
 *
 * As with backups, every query goes through `dataDb` and DATA_DATABASE_URL.
 * The retail database is not touched.
 */

export const RESTORE_CONFIRMATION = "RESTORE DATA BUNDLES";

/** Shared with the backup engine so a backup cannot run in the middle of a restore. */
const BACKUP_LOCK = [4711, 2028] as const;

const TX_TIMEOUT_MS = 10 * 60_000;
const TX_MAX_WAIT_MS = 15_000;

/** Rows per INSERT. Each row contributes one parameter per column, and Postgres caps a statement at 65535. */
const INSERT_ROWS = 500;

export interface TablePlan {
  table: string;
  /** Columns the file and the live table agree on — what will actually be written. */
  columns: string[];
  rows: number;
  /** In the backup, not in this database. Their rows cannot be restored. */
  missingColumns: string[];
  /** In this database, not in the backup. They will be left at their default. */
  extraColumns: string[];
}

export interface RestorePlan {
  meta: BackupFileMeta;
  /** Tables that will be emptied and rewritten. */
  tables: TablePlan[];
  /** In the backup but not in this database — nothing can be done with them. */
  unknownTables: string[];
  /** In this database but not in the backup. Left exactly as they are. */
  untouchedTables: string[];
  totalRows: number;
  /** True when there is nothing that should stop an admin going ahead. */
  safe: boolean;
  /** Things the admin should read before confirming. */
  warnings: string[];
  /** Things that make a restore impossible. */
  blockers: string[];
}

export interface RestoreVerification {
  table: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export type RestoreResult =
  | {
      ok: true;
      restoreId: string;
      safetyBackupId: string;
      tables: number;
      rows: number;
      verification: RestoreVerification[];
      durationMs: number;
    }
  | { ok: false; error: string; restoreId?: string; safetyBackupId?: string };

// ---------------------------------------------------------------------------
// Reading the live schema
// ---------------------------------------------------------------------------

type RawClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

interface LiveTable {
  name: string;
  columns: Map<string, BackupColumn>;
}

async function describeLiveTables(tx: RawClient): Promise<Map<string, LiveTable>> {
  const tableRows = await tx.$queryRawUnsafe<{ name: string }[]>(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  const columnRows = await tx.$queryRawUnsafe<
    { table_name: string; column_name: string; udt_name: string; data_type: string }[]
  >(`
    SELECT table_name, column_name, udt_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const live = new Map<string, LiveTable>();
  for (const { name } of tableRows) {
    if (isExcludedFromBackup(name)) continue;
    live.set(name, { name, columns: new Map() });
  }
  for (const row of columnRows) {
    const table = live.get(row.table_name);
    if (!table) continue;
    table.columns.set(row.column_name, {
      name: row.column_name,
      udt: row.data_type === "ARRAY" ? row.udt_name.replace(/^_/, "") : row.udt_name,
      array: row.data_type === "ARRAY",
    });
  }
  return live;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * The cast written after each parameter, so Postgres parses the text against
 * the column's real type. Lower-case catalog names go in bare — `::timestamp`
 * resolves where `::"timestamp"` would be looking for a user-defined type of
 * that name — and anything else is quoted so a mixed-case enum survives.
 */
function castFor(column: BackupColumn): string {
  const base = /^[a-z_][a-z0-9_]*$/.test(column.udt) ? column.udt : quoteIdent(column.udt);
  return column.array ? `${base}[]` : base;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Work out what restoring this file would do, without doing any of it.
 *
 * The console shows the result and asks the admin to confirm it. Nothing here
 * writes, so it is safe to run on a file that turns out to be rubbish — which
 * is the point: the rubbish is found here rather than halfway through a
 * truncate.
 */
export async function planRestore(
  file: Buffer,
): Promise<{ ok: true; plan: RestorePlan; parsed: { meta: BackupFileMeta; tables: BackupFileTable[] } } | { ok: false; error: string }> {
  let parsed;
  try {
    parsed = parseBackupFile(file);
  } catch (error) {
    if (error instanceof BackupFileError) return { ok: false, error: error.message };
    throw error;
  }

  let live: Map<string, LiveTable>;
  try {
    live = await describeLiveTables(dataDb);
  } catch {
    return { ok: false, error: "Could not read this database's schema to compare the backup against." };
  }

  const tables: TablePlan[] = [];
  const unknownTables: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  for (const table of parsed.tables) {
    if (isExcludedFromBackup(table.name)) {
      // Nothing we write should ever contain these; a file that does was built
      // by something else, or by hand.
      blockers.push(`The backup contains ${table.name}, which a Nickimart backup never includes.`);
      continue;
    }
    const liveTable = live.get(table.name);
    if (!liveTable) {
      unknownTables.push(table.name);
      continue;
    }
    const columns: string[] = [];
    const missingColumns: string[] = [];
    for (const column of table.columns) {
      if (liveTable.columns.has(column.name)) columns.push(column.name);
      else missingColumns.push(column.name);
    }
    const extraColumns = [...liveTable.columns.keys()].filter(
      (name) => !table.columns.some((c) => c.name === name),
    );
    if (columns.length === 0) {
      blockers.push(`${table.name} has no columns in common with this database.`);
      continue;
    }
    tables.push({ table: table.name, columns, rows: table.rows.length, missingColumns, extraColumns });
  }

  const untouchedTables = [...live.keys()].filter(
    (name) => !parsed.tables.some((t) => t.name === name),
  );

  if (unknownTables.length > 0) {
    warnings.push(
      `${unknownTables.length} table(s) in the backup do not exist here and will be skipped: ${unknownTables.join(", ")}. This backup is probably from a newer version of Nickimart.`,
    );
  }
  if (untouchedTables.length > 0) {
    warnings.push(
      `${untouchedTables.length} table(s) in this database are not in the backup and will be left exactly as they are: ${untouchedTables.join(", ")}.`,
    );
  }
  for (const t of tables) {
    if (t.missingColumns.length > 0) {
      warnings.push(
        `${t.table}: ${t.missingColumns.join(", ")} is in the backup but not in this database. Those values will be dropped.`,
      );
    }
    if (t.extraColumns.length > 0) {
      warnings.push(
        `${t.table}: ${t.extraColumns.join(", ")} exists here but not in the backup. Restored rows will take the column's default.`,
      );
    }
  }
  if (tables.length === 0) {
    blockers.push("Nothing in this backup matches this database.");
  }

  return {
    ok: true,
    parsed,
    plan: {
      meta: parsed.meta,
      tables,
      unknownTables,
      untouchedTables,
      totalRows: tables.reduce((sum, t) => sum + t.rows, 0),
      safe: blockers.length === 0 && warnings.length === 0,
      warnings,
      blockers,
    },
  };
}

// ---------------------------------------------------------------------------
// Fetching the file to restore
// ---------------------------------------------------------------------------

/**
 * The bytes of a stored backup, verified against the checksum recorded when it
 * was taken. A restore reads through this rather than through the download
 * route so it gets the same guarantee: the file is what we wrote, or it is not
 * used.
 */
export async function loadBackupBytes(
  id: string,
): Promise<{ ok: true; body: Buffer; label: string } | { ok: false; error: string }> {
  let row;
  try {
    row = await dataDb.dataBackup.findUnique({ where: { id } });
  } catch {
    return { ok: false, error: "The backup history is unavailable." };
  }
  if (!row) return { ok: false, error: "No such backup." };
  if (row.status !== "completed") {
    return { ok: false, error: `That backup is ${row.status}, so there is no file to restore.` };
  }

  let locations: BackupLocation[] = [];
  try {
    const parsed = JSON.parse(row.storageTargets);
    if (Array.isArray(parsed)) locations = parsed;
  } catch {
    // Falls through to the "no stored copy" message below.
  }

  try {
    const body = await getBackupFile(locations);
    if (row.checksum && createHash("sha256").update(body).digest("hex") !== row.checksum) {
      return {
        ok: false,
        error:
          "The stored file does not match the checksum recorded when it was taken. It has been altered or truncated — it must not be restored.",
      };
    }
    return { ok: true, body, label: `${backupKindLabel(row.kind)} · ${row.id}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ---------------------------------------------------------------------------
// Doing it
// ---------------------------------------------------------------------------

export async function runRestore(options: {
  file: Buffer;
  /** Where the file came from, for the log: a backup id, or an uploaded file name. */
  source: string;
  sourceBackupId?: string;
  confirmation: string;
  byId?: string;
  byEmail?: string;
}): Promise<RestoreResult> {
  if (options.confirmation.trim() !== RESTORE_CONFIRMATION) {
    return { ok: false, error: `Type ${RESTORE_CONFIRMATION} exactly to confirm.` };
  }

  const started = Date.now();
  const startedAt = new Date();
  const restoreId = `rst_${backupStamp(startedAt)}_${randomBytes(4).toString("hex")}`;

  // Re-planned here rather than trusting what the preview showed. The preview
  // is a different request, minutes ago, possibly against a different file.
  const planned = await planRestore(options.file);
  if (!planned.ok) return { ok: false, error: planned.error };
  const { plan, parsed } = planned;
  if (plan.blockers.length > 0) return { ok: false, error: plan.blockers.join(" ") };

  try {
    await dataDb.dataRestore.create({
      data: {
        id: restoreId,
        status: "running",
        source: options.source.slice(0, 200),
        sourceBackupId: options.sourceBackupId ?? "",
        backupId: parsed.meta.id,
        backupTakenAt: parsed.meta.takenAt,
        backupDatabaseId: parsed.meta.databaseId,
        backupSchemaVersion: parsed.meta.schemaVersion,
        tableCount: plan.tables.length,
        recordCount: plan.totalRows,
        createdById: options.byId ?? "",
        createdByEmail: options.byEmail ?? "",
        startedAt,
      },
    });
  } catch (error) {
    console.error("[data-restore] could not open a log row", error);
    return {
      ok: false,
      error:
        "Could not write to the restore log. If this is the first restore, deploy once so db/data-migrations/0019_restores.sql is applied.",
    };
  }

  // The safety backup comes before the first destructive statement, and a
  // failure here ends the restore. This is the rule the whole feature exists
  // to keep: nothing is overwritten that was not first copied.
  const safety = await runDataBackup({
    kind: "safety",
    byId: options.byId,
    byEmail: options.byEmail,
  });
  if (!safety.ok) {
    await failRestore(restoreId, `Safety backup failed, so nothing was restored. ${safety.error}`, started);
    return {
      ok: false,
      error: `The safety backup of the current database failed, so nothing has been changed. ${safety.error}`,
      restoreId,
    };
  }

  await dataDb.dataRestore
    .update({ where: { id: restoreId }, data: { safetyBackupId: safety.backup.id } })
    .catch(() => {});

  try {
    const verification = await applyRestore(parsed.tables, plan);
    const durationMs = Date.now() - started;
    await dataDb.dataRestore.update({
      where: { id: restoreId },
      data: {
        status: "completed",
        verification: JSON.stringify(verification),
        durationMs,
        completedAt: new Date(),
        error: null,
      },
    });
    console.log(
      `[data-restore] ${restoreId} completed — ${plan.tables.length} tables, ${plan.totalRows} rows from ${parsed.meta.id}`,
    );

    return {
      ok: true,
      restoreId,
      safetyBackupId: safety.backup.id,
      tables: plan.tables.length,
      rows: plan.totalRows,
      verification,
      durationMs,
    };
  } catch (error) {
    console.error(`[data-restore] ${restoreId} failed`, error);
    const message = describeFailure(error);
    await failRestore(restoreId, message, started);
    return {
      ok: false,
      error: message,
      restoreId,
      safetyBackupId: safety.backup.id,
    };
  }
}

/**
 * Turn whatever went wrong into something an admin can act on.
 *
 * Two things matter in that sentence. The first is that nothing was changed —
 * every write happens in one transaction, so a failure anywhere leaves the
 * database exactly as it was, and that is the thing the person reading this is
 * most afraid of. The second is what Postgres actually objected to: a driver
 * error arrives as a multi-line block with an invocation banner and a stack,
 * and pasting that into a red box tells nobody anything.
 */
function describeFailure(error: unknown): string {
  const unchanged = "Nothing was changed — the restore ran in a transaction and has been rolled back.";

  const meta = (error as { meta?: { code?: string; message?: string } } | null)?.meta;
  if (meta?.message) {
    const code = meta.code ? ` (SQLSTATE ${meta.code})` : "";
    return `${unchanged} Postgres rejected the data: ${meta.message.trim()}${code}. The backup does not fit this database's constraints.`;
  }

  const raw = error instanceof Error ? error.message : String(error);
  // A Prisma error's message is a banner, a blank line, then the real text.
  const detail = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^invalid `|^raw query failed/i.test(line))
    .join(" ")
    .slice(0, 400);
  return detail ? `${unchanged} ${detail}` : unchanged;
}

async function failRestore(restoreId: string, message: string, started: number): Promise<void> {
  await dataDb.dataRestore
    .update({
      where: { id: restoreId },
      data: {
        status: "failed",
        error: message.slice(0, 1000),
        durationMs: Date.now() - started,
        completedAt: new Date(),
      },
    })
    .catch(() => {});
}

/**
 * Empty the target tables and write the backup's rows into them, in one
 * transaction.
 *
 * `TRUNCATE` on every table in a single statement rather than one at a time:
 * Postgres then does not care what references what, so no foreign key has to
 * be dropped and no order has to be worked out. It is transactional here, so a
 * failure anywhere below leaves the database untouched rather than empty —
 * which is the difference between a failed restore and a disaster.
 */
async function applyRestore(
  fileTables: BackupFileTable[],
  plan: RestorePlan,
): Promise<RestoreVerification[]> {
  const byName = new Map(fileTables.map((t) => [t.name, t]));

  return dataDb.$transaction(
    async (tx) => {
      const locked = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
        `SELECT pg_try_advisory_xact_lock(${BACKUP_LOCK[0]}, ${BACKUP_LOCK[1]}) AS locked`,
      );
      if (!locked[0]?.locked) {
        throw new Error("A backup or restore is already running. Wait for it to finish.");
      }

      // The live column types, read inside the transaction: the casts below
      // must match the schema being written to, not the one in the file.
      const live = await describeLiveTables(tx);

      const targets = plan.tables.map((t) => quoteIdent(t.table)).join(", ");
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${targets}`);

      for (const target of plan.tables) {
        const table = byName.get(target.table);
        const liveTable = live.get(target.table);
        if (!table || !liveTable) throw new Error(`${target.table} vanished mid-restore.`);
        if (table.rows.length === 0) continue;

        // Positions in the file's row arrays, for the columns being written.
        const picks = target.columns.map((name) => ({
          index: table.columns.findIndex((c) => c.name === name),
          fileColumn: table.columns.find((c) => c.name === name)!,
          liveColumn: liveTable.columns.get(name)!,
        }));

        const columnList = target.columns.map(quoteIdent).join(", ");
        const casts = picks.map((p) => castFor(p.liveColumn));

        for (let start = 0; start < table.rows.length; start += INSERT_ROWS) {
          const batch = table.rows.slice(start, start + INSERT_ROWS);
          const params: (string | null)[] = [];
          const tuples = batch.map((row) => {
            const placeholders = picks.map((p, i) => {
              params.push(toPgText(row[p.index], p.fileColumn));
              return `$${params.length}::${casts[i]}`;
            });
            return `(${placeholders.join(", ")})`;
          });
          await tx.$executeRawUnsafe(
            `INSERT INTO ${quoteIdent(target.table)} (${columnList}) VALUES ${tuples.join(", ")}`,
            ...params,
          );
        }
      }

      // Counted from the database, inside the same transaction that wrote
      // them. "Restored" has to mean the rows are there, not that the inserts
      // did not throw.
      const verification: RestoreVerification[] = [];
      for (const target of plan.tables) {
        const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM ${quoteIdent(target.table)}`,
        );
        const actual = Number(n);
        verification.push({
          table: target.table,
          expected: target.rows,
          actual,
          ok: actual === target.rows,
        });
      }

      // Still inside the transaction, deliberately: a restore whose row counts
      // do not match the backup must not be committed and then reported. A
      // trigger, a rule, or a partial insert that got this far is a reason to
      // put the database back the way it was and say so.
      const failed = verification.filter((v) => !v.ok);
      if (failed.length > 0) {
        throw new Error(
          `Verification failed for ${failed
            .map((f) => `${f.table} (expected ${f.expected} rows, found ${f.actual})`)
            .join(", ")}.`,
        );
      }

      return verification;
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface RestoreSummary {
  id: string;
  status: string;
  statusLabel: string;
  source: string;
  backupId: string;
  backupTakenAt: Date | null;
  safetyBackupId: string;
  tableCount: number;
  recordCount: number;
  durationMs: number;
  error: string | null;
  createdByEmail: string;
  startedAt: Date;
  completedAt: Date | null;
}

const RESTORE_STATUS_LABELS: Record<string, string> = {
  running: "In progress",
  completed: "Completed",
  failed: "Failed",
};

export async function listDataRestores(limit = 20): Promise<RestoreSummary[]> {
  try {
    const rows = await dataDb.dataRestore.findMany({ orderBy: { startedAt: "desc" }, take: limit });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      statusLabel: RESTORE_STATUS_LABELS[row.status] ?? row.status,
      source: row.source,
      backupId: row.backupId,
      backupTakenAt: row.backupTakenAt,
      safetyBackupId: row.safetyBackupId,
      tableCount: row.tableCount,
      recordCount: row.recordCount,
      durationMs: row.durationMs,
      error: row.error,
      createdByEmail: row.createdByEmail,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    }));
  } catch {
    return [];
  }
}
