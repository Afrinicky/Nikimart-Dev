-- Backup history for the Data Bundles database.
--
-- The row is the log entry, not the backup: the snapshot itself is written to
-- storage outside this database (a directory on disk, an S3-compatible bucket,
-- or both), because a backup that only exists inside the database it is meant
-- to protect protects nothing. What lives here is the receipt — when it ran,
-- who asked for it, what it covered, how big it came out, and the checksum
-- that proves the file you download later is the file we wrote.
--
-- It is deliberately excluded from the snapshots it describes. A restore is
-- supposed to bring business data back; it must not roll the backup history
-- back to whatever it was when the snapshot was taken, least of all erasing
-- the safety backup taken moments before the restore.

CREATE TABLE IF NOT EXISTS "DataBackup" (
  "id"             TEXT NOT NULL,
  -- manual | safety | auto-daily | auto-weekly | auto-monthly. Only "manual"
  -- is written today; the others are what phases 2 and 3 will add.
  "kind"           TEXT NOT NULL DEFAULT 'manual',
  -- running | completed | failed. A row is inserted before the dump starts, so
  -- a crash mid-dump leaves evidence rather than nothing.
  "status"         TEXT NOT NULL DEFAULT 'running',
  -- The on-disk format, so a future reader knows what it is being handed.
  "format"         TEXT NOT NULL DEFAULT '',
  "fileName"       TEXT NOT NULL DEFAULT '',
  "tableCount"     INTEGER NOT NULL DEFAULT 0,
  "recordCount"    INTEGER NOT NULL DEFAULT 0,
  -- Compressed size of the stored file, in bytes.
  "byteSize"       INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 of the stored file. Checked on every download.
  "checksum"       TEXT NOT NULL DEFAULT '',
  -- Which database this came from: "<database>@<host>". Never a credential —
  -- no user, no password, no query string.
  "databaseId"     TEXT NOT NULL DEFAULT '',
  -- The last migration applied when the snapshot was taken, and the build that
  -- took it. Together they say which code this data was shaped by.
  "schemaVersion"  TEXT NOT NULL DEFAULT '',
  "appVersion"     TEXT NOT NULL DEFAULT '',
  -- Where the file went. "storage" is the target a download reads from first;
  -- "storageTargets" is the full JSON list, so a mirrored backup records both.
  "storage"        TEXT NOT NULL DEFAULT 'none',
  "storageKey"     TEXT NOT NULL DEFAULT '',
  "storageTargets" TEXT NOT NULL DEFAULT '[]',
  -- Per-table row counts as JSON: what a verification pass compares against.
  "manifest"       TEXT NOT NULL DEFAULT '[]',
  "error"          TEXT,
  "durationMs"     INTEGER NOT NULL DEFAULT 0,
  -- Who pressed the button. The id is from the retail database (that is where
  -- accounts live); the email is copied so history stays readable without a
  -- cross-database lookup.
  "createdById"    TEXT NOT NULL DEFAULT '',
  "createdByEmail" TEXT NOT NULL DEFAULT '',
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  CONSTRAINT "DataBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataBackup_startedAt_idx" ON "DataBackup"("startedAt");
CREATE INDEX IF NOT EXISTS "DataBackup_status_idx" ON "DataBackup"("status");
CREATE INDEX IF NOT EXISTS "DataBackup_kind_startedAt_idx" ON "DataBackup"("kind", "startedAt");
