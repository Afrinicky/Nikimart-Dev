import { Download, Archive, CircleAlert, CircleCheck, Loader } from "lucide-react";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatBytes, formatDuration } from "@/lib/data-bundles/backup-format";
import type { DataBackupSummary } from "@/lib/data-bundles/backup";
import { cn } from "@/lib/cn";

/**
 * Every backup ever taken of the Data Bundles database, newest first.
 *
 * The columns are the questions you ask of a backup list when something has
 * gone wrong: how old is the newest good one, did it finish, how much did it
 * actually capture, where is it, and can I have it. A row that failed keeps its
 * reason — a history that silently drops its failures is how a business
 * discovers on the day of the outage that nothing has run since March.
 *
 * The checksum is shown truncated and in full on hover: it is the thing you
 * compare against after moving a file between machines, so it has to be
 * readable, and it is 64 characters long.
 */

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

function StatusPill({ status, label }: { status: string; label: string }) {
  const Icon = status === "completed" ? CircleCheck : status === "failed" ? CircleAlert : Loader;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold",
        status === "completed" && "bg-niki-success/12 text-emerald-700",
        status === "failed" && "bg-niki-danger/10 text-niki-danger",
        status === "running" && "bg-niki-gold/20 text-amber-900",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-spin")} />
      {label}
    </span>
  );
}

export function DataBackupHistory({ rows }: { rows: DataBackupSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Archive className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">No backups yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">
          Press “Create Full Backup” to take the first snapshot. Every one you take is listed here
          with its size, contents and checksum.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-niki-surface/70">
            <th className={`${th} rounded-l-lg`}>Taken</th>
            <th className={th}>Type</th>
            <th className={th}>Status</th>
            <th className={th}>Tables</th>
            <th className={th}>Records</th>
            <th className={th}>Size</th>
            <th className={th}>Took</th>
            <th className={th}>Stored in</th>
            <th className={th}>Schema</th>
            <th className={th}>Checksum</th>
            <th className={th}>By</th>
            <th className={`${th} sticky right-0 rounded-r-lg bg-niki-surface text-right`}>File</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-niki-edge/60 last:border-0">
              <td className={td}>
                <span className="font-semibold text-niki-ink">{formatWhen(b.startedAt)}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-niki-ink/45">{b.id}</span>
              </td>
              <td className={`${td} text-niki-ink/70`}>{b.kindLabel}</td>
              <td className={td}>
                <StatusPill status={b.status} label={b.statusLabel} />
                {b.error ? (
                  // Clamped, with the whole thing on hover: a driver's error can
                  // run to a paragraph, and one failed row should not push the
                  // rest of the history off the screen.
                  <span
                    title={b.error}
                    className="mt-1 line-clamp-2 max-w-[15rem] text-[11px] leading-snug text-niki-danger"
                  >
                    {b.error}
                  </span>
                ) : null}
              </td>
              <td className={`${td} tabular-nums text-niki-ink/70`}>
                {b.status === "completed" ? b.tableCount : "—"}
              </td>
              <td className={`${td} tabular-nums text-niki-ink/70`}>
                {b.status === "completed" ? b.recordCount.toLocaleString("en-GB") : "—"}
              </td>
              <td className={`${td} tabular-nums text-niki-ink/70`}>
                {b.status === "completed" ? formatBytes(b.byteSize) : "—"}
              </td>
              <td className={`${td} tabular-nums text-niki-ink/55`}>
                {formatDuration(b.durationMs)}
              </td>
              <td className={`${td} text-niki-ink/70`}>
                {b.locations.filter((l) => l.ok).map((l) => l.label).join(", ") || "—"}
              </td>
              <td className={`${td} font-mono text-[11px] text-niki-ink/55`}>
                {b.schemaVersion || "—"}
              </td>
              <td className={`${td} font-mono text-[11px] text-niki-ink/55`}>
                {b.checksum ? (
                  <span title={`sha256:${b.checksum}`}>{b.checksum.slice(0, 12)}…</span>
                ) : (
                  "—"
                )}
              </td>
              <td className={`${td} text-niki-ink/60`}>{b.createdByEmail || "—"}</td>
              <td className={`${td} sticky right-0 bg-white text-right shadow-[-8px_0_8px_-8px_rgba(16,16,16,0.12)]`}>
                {b.downloadable ? (
                  <a
                    href={`/admin/data/settings/backups/${b.id}/download`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge-control transition-colors hover:bg-white"
                  >
                    <Download className="h-3.5 w-3.5 text-niki-success" />
                    Download
                  </a>
                ) : (
                  // Why there is nothing to click, rather than a button that
                  // could only fail: a direct download was never kept here,
                  // and a temporary copy does not survive a deploy.
                  <span className="text-xs text-niki-ink/45" title={unavailableReason(b)}>
                    {b.status === "completed" ? unavailableLabel(b) : "—"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Short label for a completed backup with no file to hand over. */
function unavailableLabel(b: DataBackupSummary): string {
  if (b.kind === "download") return "Not retained";
  if (b.locations.some((l) => l.label === "Temporary server storage")) return "Copy expired";
  return "Unavailable";
}

function unavailableReason(b: DataBackupSummary): string {
  if (b.kind === "download")
    return "This snapshot was downloaded straight to a computer and never stored here.";
  if (b.locations.some((l) => l.label === "Temporary server storage"))
    return "This snapshot was written to temporary server storage, which does not survive a restart or a deploy. Take a fresh backup.";
  return "No stored copy of this backup remains.";
}
