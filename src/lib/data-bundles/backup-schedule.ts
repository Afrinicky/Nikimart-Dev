import "server-only";
import { dataDb } from "@/lib/data-db";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { backupKindLabel } from "@/lib/data-bundles/backup-format";
import { AUTO_KINDS, tierFor, type AutoKind } from "@/lib/data-bundles/backup-tiers";
import { backupTargets, deleteBackupFile, type BackupLocation } from "@/lib/data-bundles/backup-storage";
import { runDataBackup } from "@/lib/data-bundles/backup";

/**
 * Automatic backups, and the retention that stops them filling a bucket.
 *
 * One snapshot per run, labelled by the longest period it opens — see
 * backup-tiers.ts for that rule and why it is written the way it is.
 *
 * Retention is counted per tier and applies only to automatic snapshots. A
 * manual backup, an uploaded one, and the safety copy taken before a restore
 * are never pruned — somebody decided to have each of those, and a schedule is
 * not entitled to overrule a decision. Pruning deletes the stored files first
 * and the history row only once they are gone, so a row that survives a failed
 * delete is a row that still points at a real file rather than a ghost.
 */

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ScheduleReadiness {
  /** The admin has turned automatic backups on. */
  enabled: boolean;
  /** Everything needed is in place and the next run will take a snapshot. */
  ready: boolean;
  /** Why it will not run, in a sentence an admin can act on. */
  blocker?: string;
  /** True when a copy lands somewhere that outlives this server. */
  offsite: boolean;
  retention: { daily: number; weekly: number; monthly: number };
}

function count(value: string, fallback: number): number {
  // An empty setting falls back rather than being read as a number: `Number("")`
  // is 0, and a blank row arriving here would silently mean "keep none of this
  // tier" — the most destructive reading of the absence of a value.
  if (value.trim() === "") return fallback;
  const n = Number(value);
  // Zero itself is meaningful when it was actually typed, so only reject nonsense.
  return Number.isInteger(n) && n >= 0 && n <= 3650 ? n : fallback;
}

export async function scheduleReadiness(): Promise<ScheduleReadiness> {
  const settings = await getDataSettings();
  const retention = {
    daily: count(settings.backupRetainDaily, 14),
    weekly: count(settings.backupRetainWeekly, 8),
    monthly: count(settings.backupRetainMonthly, 12),
  };
  const enabled = settings.backupAutoEnabled !== "0";
  const targets = backupTargets();
  const offsite = targets.some((t) => t.offsite);
  const durable = targets.filter((t) => !t.ephemeral);

  let blocker: string | undefined;
  if (durable.length === 0) {
    // A nightly snapshot into a directory the next deploy wipes is not a
    // backup, it is a cron job that burns database time. Better to refuse and
    // say why than to show a row of green ticks for files that are gone.
    blocker =
      "No durable storage is configured. Automatic backups would be written to a temporary directory and lost on the next deploy. Set DATA_BACKUP_S3_* (or DATA_BACKUP_LOCAL_DIR on a server with a persistent disk).";
  } else if (!process.env.CRON_SECRET?.trim()) {
    // The backup endpoint is the one cron route that must not be open: it
    // writes a copy of the whole business on demand.
    blocker =
      "CRON_SECRET is not set, so the scheduled endpoint refuses to run. Set it in the deployment environment.";
  }

  return { enabled, ready: enabled && !blocker, blocker, offsite, retention };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export type ScheduledRunResult =
  | { status: "skipped"; reason: string }
  | { status: "failed"; kind: AutoKind; error: string; pruned: number }
  | { status: "completed"; kind: AutoKind; backupId: string; pruned: number };

/**
 * Take tonight's snapshot and prune what has aged out.
 *
 * Pruning runs even when the snapshot failed: a bucket that stops being
 * trimmed because backups started failing is a second problem on top of the
 * first, and the rows being pruned are older ones that are still valid.
 */
export async function runScheduledBackup(now = new Date()): Promise<ScheduledRunResult> {
  const readiness = await scheduleReadiness();
  if (!readiness.enabled) return { status: "skipped", reason: "Automatic backups are switched off." };
  if (readiness.blocker) return { status: "skipped", reason: readiness.blocker };

  const last = await lastAutomatic();
  const kind = tierFor(now, last);

  const result = await runDataBackup({ kind, byEmail: "Scheduled backup" });
  const pruned = await pruneBackups(readiness.retention);

  if (!result.ok) {
    console.error(`[data-backup] scheduled ${kind} failed: ${result.error}`);
    return { status: "failed", kind, error: result.error, pruned };
  }
  console.log(`[data-backup] scheduled ${kind} ${result.backup.id} completed, pruned ${pruned}`);
  return { status: "completed", kind, backupId: result.backup.id, pruned };
}

async function lastAutomatic(): Promise<{ weekly: Date | null; monthly: Date | null }> {
  const pick = async (kind: AutoKind) => {
    const row = await dataDb.dataBackup.findFirst({
      where: { kind, status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  };
  // A monthly is also the week's snapshot, and a weekly is also that day's, so
  // "when was the last weekly" has to count the monthly that stood in for it.
  const [weekly, monthly] = await Promise.all([pick("auto-weekly"), pick("auto-monthly")]);
  if (!weekly) return { weekly: monthly, monthly };
  if (!monthly) return { weekly, monthly };
  return { weekly: weekly > monthly ? weekly : monthly, monthly };
}

/**
 * Delete automatic snapshots beyond the retention count for their tier.
 *
 * Only ever completed automatic ones: a failed row is the evidence that a
 * night went wrong and is kept until a human has seen it, and manual,
 * uploaded and safety backups are outside this entirely.
 */
export async function pruneBackups(retention: {
  daily: number;
  weekly: number;
  monthly: number;
}): Promise<number> {
  const keep: Record<AutoKind, number> = {
    "auto-daily": retention.daily,
    "auto-weekly": retention.weekly,
    "auto-monthly": retention.monthly,
  };

  let removed = 0;
  for (const kind of AUTO_KINDS) {
    let rows;
    try {
      rows = await dataDb.dataBackup.findMany({
        where: { kind, status: "completed" },
        orderBy: { startedAt: "desc" },
        select: { id: true, storageTargets: true },
      });
    } catch {
      return removed;
    }

    for (const row of rows.slice(keep[kind])) {
      let locations: BackupLocation[] = [];
      try {
        const parsed = JSON.parse(row.storageTargets);
        if (Array.isArray(parsed)) locations = parsed;
      } catch {
        // No readable location list: the row is all that is left of it.
      }
      try {
        // Files first. A row deleted before its file leaves an object nobody
        // has a name for any more, paid for forever.
        await deleteBackupFile(locations);
        await dataDb.dataBackup.delete({ where: { id: row.id } });
        removed++;
      } catch (error) {
        console.error(`[data-backup] could not prune ${row.id}`, error);
      }
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// What the console shows
// ---------------------------------------------------------------------------

export interface AutoBackupStatus extends ScheduleReadiness {
  /** The most recent automatic attempt, succeeded or failed. */
  lastRun: {
    id: string;
    kind: string;
    kindLabel: string;
    status: string;
    startedAt: Date;
    error: string | null;
  } | null;
  /** How many of each tier are being kept right now. */
  held: { daily: number; weekly: number; monthly: number };
}

export async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
  const readiness = await scheduleReadiness();

  try {
    const [lastRun, daily, weekly, monthly] = await Promise.all([
      dataDb.dataBackup.findFirst({
        where: { kind: { in: AUTO_KINDS } },
        orderBy: { startedAt: "desc" },
        select: { id: true, kind: true, status: true, startedAt: true, error: true },
      }),
      dataDb.dataBackup.count({ where: { kind: "auto-daily", status: "completed" } }),
      dataDb.dataBackup.count({ where: { kind: "auto-weekly", status: "completed" } }),
      dataDb.dataBackup.count({ where: { kind: "auto-monthly", status: "completed" } }),
    ]);

    return {
      ...readiness,
      lastRun: lastRun
        ? { ...lastRun, kindLabel: backupKindLabel(lastRun.kind) }
        : null,
      held: { daily, weekly, monthly },
    };
  } catch {
    return { ...readiness, lastRun: null, held: { daily: 0, weekly: 0, monthly: 0 } };
  }
}
