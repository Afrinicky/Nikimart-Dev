-- The restore log.
--
-- A restore is the one operation in the console that destroys data on
-- purpose, so every attempt — including the ones that failed, and above all
-- the ones that failed — leaves a row here saying who ran it, which backup
-- they restored, which safety backup was taken of what they overwrote, and
-- whether the row counts afterwards matched what the backup claimed.
--
-- Like DataBackup, this table is excluded from the snapshots themselves: a
-- restore must not erase the record of the restore.

CREATE TABLE IF NOT EXISTS "DataRestore" (
  "id"                  TEXT NOT NULL,
  -- running | completed | failed.
  "status"              TEXT NOT NULL DEFAULT 'running',
  -- Where the file came from: a backup id from history, or an uploaded name.
  "source"              TEXT NOT NULL DEFAULT '',
  -- Set when the file came from this database's own backup history.
  "sourceBackupId"      TEXT NOT NULL DEFAULT '',
  -- What the file says about itself, read from its header.
  "backupId"            TEXT NOT NULL DEFAULT '',
  "backupTakenAt"       TIMESTAMP(3),
  "backupDatabaseId"    TEXT NOT NULL DEFAULT '',
  "backupSchemaVersion" TEXT NOT NULL DEFAULT '',
  -- The copy of the pre-restore database. The way back.
  "safetyBackupId"      TEXT NOT NULL DEFAULT '',
  "tableCount"          INTEGER NOT NULL DEFAULT 0,
  "recordCount"         INTEGER NOT NULL DEFAULT 0,
  -- Per-table expected/actual counts, as JSON, read back after the write.
  "verification"        TEXT NOT NULL DEFAULT '[]',
  "error"               TEXT,
  "durationMs"          INTEGER NOT NULL DEFAULT 0,
  "createdById"         TEXT NOT NULL DEFAULT '',
  "createdByEmail"      TEXT NOT NULL DEFAULT '',
  "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"         TIMESTAMP(3),
  CONSTRAINT "DataRestore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataRestore_startedAt_idx" ON "DataRestore"("startedAt");
CREATE INDEX IF NOT EXISTS "DataRestore_status_idx" ON "DataRestore"("status");
