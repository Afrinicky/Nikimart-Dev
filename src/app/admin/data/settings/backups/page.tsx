import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  CloudUpload,
  Download,
  HardDrive,
} from "lucide-react";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { DataBackupPanel } from "@/components/admin/DataBackupPanel";
import { DataBackupHistory } from "@/components/admin/DataBackupHistory";
import { DataRestorePanel } from "@/components/admin/DataRestorePanel";
import { requireAdmin } from "@/lib/session";
import { getBackupOverview, listDataBackups } from "@/lib/data-bundles/backup";
import { listDataRestores, type RestoreSummary } from "@/lib/data-bundles/restore";
import { formatBytes, formatDuration } from "@/lib/data-bundles/backup-format";
import { formatWhen } from "@/components/agent/AgentUi";
import { isDataDatabaseSeparate } from "@/lib/data-db";

export const metadata: Metadata = { title: "Backups — Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Backup & recovery for the Data Bundles database.
 *
 * The console frame already refuses anyone who is not an admin, but a page
 * whose whole purpose is to produce a copy of the entire business checks for
 * itself as well — one guard is a configuration away from being the wrong one.
 *
 * Everything on this page is about DATA_DATABASE_URL. The retail mall has its
 * own database and is not read, listed or counted anywhere here.
 */
export default async function DataBackupsPage() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) redirect("/admin");

  const [overview, history, restores] = await Promise.all([
    getBackupOverview(),
    listDataBackups(50),
    listDataRestores(20),
  ]);
  const { targets, offsite, latest, lastGood } = overview;
  const ephemeralOnly = targets.length > 0 && targets.every((t) => t.ephemeral);

  const restorable = history
    .filter((b) => b.downloadable)
    .map((b) => ({
      id: b.id,
      label: `${b.kindLabel} · ${formatWhen(b.startedAt)} · ${b.tableCount} tables · ${b.recordCount.toLocaleString("en-GB")} records · ${formatBytes(b.byteSize)}`,
    }));

  const storageSummary =
    targets.length === 0
      ? "No storage configured."
      : `Written to ${targets.map((t) => t.label).join(" and ")}.`;

  return (
    <div className="space-y-6">
      {/* 1 — Status at the top: is this database protected, and how recently. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={lastGood ? CircleCheck : CircleAlert}
          tone={lastGood ? "good" : "bad"}
          label="Last good backup"
          value={lastGood ? formatWhen(lastGood.startedAt) : "Never"}
          hint={
            lastGood
              ? `${lastGood.tableCount} tables · ${lastGood.recordCount.toLocaleString("en-GB")} records`
              : "This database has no snapshot yet."
          }
        />
        <StatCard
          icon={offsite ? CloudUpload : HardDrive}
          tone={offsite ? "good" : "warn"}
          label="Where backups go"
          value={targets.length === 0 ? "Nowhere" : targets[0].label}
          hint={
            targets.length === 0
              ? "Configure storage before relying on this."
              : offsite
                ? "A copy lands off this server."
                : "On-server only — no off-site copy."
          }
        />
        <StatCard
          icon={Download}
          tone="plain"
          label="Backups kept"
          value={String(overview.totalBackups)}
          hint={`${formatBytes(overview.totalBytes)} in total`}
        />
        <StatCard
          icon={Clock}
          tone={latest?.status === "failed" ? "bad" : "plain"}
          label="Latest attempt"
          value={latest ? latest.statusLabel : "—"}
          hint={latest ? `${formatWhen(latest.startedAt)} · ${formatDuration(latest.durationMs)}` : "Nothing run yet"}
        />
      </section>

      {!overview.available ? (
        <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
          The backup history table is not in this database yet. It is created by
          <code className="mx-1 font-mono text-xs">db/data-migrations/0018_backups.sql</code>, which
          runs on the next deploy.
        </p>
      ) : null}

      {ephemeralOnly ? (
        <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
          Backups are currently going to a temporary directory on the server, which a restart or a
          new deploy will wipe. That is fine for taking a copy you download straight away, and it is
          not disaster recovery. Set <code className="font-mono text-xs">DATA_BACKUP_S3_*</code> to
          store them in Cloudflare R2, Amazon S3, Google Cloud Storage or any S3-compatible bucket.
        </p>
      ) : null}

      {!isDataDatabaseSeparate() ? (
        <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
          <code className="font-mono text-xs">DATA_DATABASE_URL</code> is not set, so the bundle
          tables still live in the retail database. Backups and restores here are narrowed to the
          tables the Data Bundles schema declares: the retail mall is never read into a backup file
          and never written to by a restore. A bundle table created by hand in SQL and never added
          to the schema is outside that list until the databases are split.
        </p>
      ) : null}

      {/* 2 — The action. */}
      <DataBackupPanel
        canStore={targets.length > 0}
        offsite={offsite}
        storageSummary={storageSummary}
      />

      {/* 3 — What the newest backup actually contains. */}
      {lastGood ? <LatestBackup backup={lastGood} /> : null}

      {/* 4 — History, with 5 — downloads. */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <PanelHeading
          title="Backup history"
          subtitle="Every snapshot, what it covered, and where it is."
        />
        <DataBackupHistory rows={history} />
      </section>

      {/* 6 — Restore, fenced off and in the danger colours. */}
      <DataRestorePanel backups={restorable} />

      {restores.length > 0 ? <RestoreHistory rows={restores} /> : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  tone: "good" | "warn" | "bad" | "plain";
  label: string;
  value: string;
  hint: string;
}) {
  const toneClass =
    tone === "good"
      ? "bg-niki-success/12 text-emerald-700"
      : tone === "warn"
        ? "bg-niki-gold/20 text-amber-800"
        : tone === "bad"
          ? "bg-niki-danger/10 text-niki-danger"
          : "bg-niki-surface text-niki-ink/50";

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
          {label}
        </span>
      </div>
      <p className="mt-3 font-figures text-xl font-bold text-niki-ink">{value}</p>
      <p className="mt-1 text-xs leading-snug text-niki-ink/55">{hint}</p>
    </div>
  );
}

/**
 * The newest good snapshot in detail: the metadata a restore has to be checked
 * against, and the per-table counts that say what it really captured.
 */
function LatestBackup({ backup }: { backup: Awaited<ReturnType<typeof listDataBackups>>[number] }) {
  const biggest = [...backup.manifest].sort((a, b) => b.rows - a.rows).slice(0, 12);

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <PanelHeading title="Latest backup" subtitle="What the newest good snapshot holds.">
        <a
          href={`/admin/data/settings/backups/${backup.id}/download`}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
        >
          <Download className="h-4 w-4 text-niki-success" />
          Download
        </a>
      </PanelHeading>

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Backup ID" value={backup.id} mono />
        <Detail label="Taken" value={formatWhen(backup.startedAt)} />
        <Detail label="Type" value={backup.kindLabel} />
        <Detail label="Format" value={backup.format} mono />
        <Detail label="Database" value={backup.databaseId} mono />
        <Detail label="Schema version" value={backup.schemaVersion} mono />
        <Detail label="App version" value={backup.appVersion} mono />
        <Detail label="Duration" value={formatDuration(backup.durationMs)} />
        <Detail label="Tables" value={String(backup.tableCount)} />
        <Detail label="Records" value={backup.recordCount.toLocaleString("en-GB")} />
        <Detail label="File size" value={formatBytes(backup.byteSize)} />
        <Detail label="Stored in" value={backup.locations.filter((l) => l.ok).map((l) => l.label).join(", ") || "—"} />
        <div className="sm:col-span-2 lg:col-span-4">
          <Detail label="SHA-256 checksum" value={backup.checksum} mono wrap />
        </div>
      </dl>

      {biggest.length > 0 ? (
        <div className="mt-6 border-t border-niki-edge pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
            Largest tables in this snapshot
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {biggest.map((t) => (
              <li
                key={t.table}
                className="rounded-lg bg-niki-surface px-2.5 py-1.5 text-xs text-niki-ink/70"
              >
                <span className="font-mono">{t.table}</span>
                <span className="ml-1.5 font-semibold tabular-nums text-niki-ink">
                  {t.rows.toLocaleString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Detail({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-niki-ink ${mono ? "font-mono text-xs" : ""} ${
          wrap ? "break-all" : "truncate"
        }`}
        title={value}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

/**
 * What has been restored, and what it overwrote.
 *
 * Shown only once something has been — an empty table here would be noise —
 * and every row carries the safety backup taken before it, because the
 * question after a restore is always "can we go back".
 */
function RestoreHistory({ rows }: { rows: RestoreSummary[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <PanelHeading
        title="Restore history"
        subtitle="Every restore attempted on this database, and the safety backup each one took first."
      />
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-niki-surface/70">
              <th className={`${rth} rounded-l-lg`}>When</th>
              <th className={rth}>Status</th>
              <th className={rth}>Backup restored</th>
              <th className={rth}>Tables</th>
              <th className={rth}>Records</th>
              <th className={rth}>Took</th>
              <th className={rth}>Safety backup</th>
              <th className={`${rth} rounded-r-lg`}>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-niki-edge/60 last:border-0">
                <td className={rtd}>
                  <span className="font-semibold text-niki-ink">{formatWhen(r.startedAt)}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-niki-ink/45">{r.id}</span>
                </td>
                <td className={rtd}>
                  <span
                    className={
                      r.status === "completed"
                        ? "inline-flex items-center gap-1.5 rounded-md bg-niki-success/12 px-2 py-1 text-[11px] font-bold text-emerald-700"
                        : r.status === "failed"
                          ? "inline-flex items-center gap-1.5 rounded-md bg-niki-danger/10 px-2 py-1 text-[11px] font-bold text-niki-danger"
                          : "inline-flex items-center gap-1.5 rounded-md bg-niki-gold/20 px-2 py-1 text-[11px] font-bold text-amber-900"
                    }
                  >
                    {r.status === "completed" ? (
                      <CircleCheck className="h-3.5 w-3.5" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5" />
                    )}
                    {r.statusLabel}
                  </span>
                  {r.error ? (
                    <span
                      title={r.error}
                      className="mt-1 line-clamp-2 max-w-[15rem] text-[11px] leading-snug text-niki-danger"
                    >
                      {r.error}
                    </span>
                  ) : null}
                </td>
                <td className={`${rtd} font-mono text-[11px] text-niki-ink/60`}>
                  {r.backupId || "—"}
                  {r.backupTakenAt ? (
                    <span className="mt-0.5 block font-sans text-niki-ink/45">
                      taken {formatWhen(r.backupTakenAt)}
                    </span>
                  ) : null}
                </td>
                <td className={`${rtd} tabular-nums text-niki-ink/70`}>{r.tableCount}</td>
                <td className={`${rtd} tabular-nums text-niki-ink/70`}>
                  {r.recordCount.toLocaleString("en-GB")}
                </td>
                <td className={`${rtd} tabular-nums text-niki-ink/55`}>
                  {formatDuration(r.durationMs)}
                </td>
                <td className={`${rtd} font-mono text-[11px] text-niki-ink/60`}>
                  {r.safetyBackupId || "—"}
                </td>
                <td className={`${rtd} text-niki-ink/60`}>{r.createdByEmail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const rth =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const rtd = "px-4 py-3.5 align-top";
