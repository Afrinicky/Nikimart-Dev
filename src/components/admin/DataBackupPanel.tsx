"use client";

import { useActionState } from "react";
import { DatabaseBackup, Download, HardDriveDownload, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { createDataBackup, type BackupActionState } from "@/lib/data-bundles/backup-actions";

/**
 * The button that takes a snapshot, and what it says afterwards.
 *
 * A full dump is not instant, so the pending state matters: `SubmitButton`
 * disables itself and spins for as long as the action runs, which is what
 * stops an impatient second press from opening a second long transaction
 * against the same database (the engine also holds an advisory lock, but the
 * cheapest guard is the one that stops the request being made).
 *
 * The file is never returned through the action — a server action's result is
 * serialised into the page, and the whole database has no business going
 * there. The action returns an id and the download is a separate GET.
 */
export function DataBackupPanel({
  canStore,
  offsite,
  storageSummary,
}: {
  /** False when no storage is configured and the button would have nowhere to write. */
  canStore: boolean;
  /** True when a copy lands off this server. */
  offsite: boolean;
  /** Where backups go, in one line. */
  storageSummary: string;
}) {
  const [state, formAction] = useActionState<BackupActionState, FormData>(createDataBackup, {});

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
            <DatabaseBackup className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Create a full backup</h2>
            <p className="mt-1 max-w-xl text-sm text-niki-ink/60">
              Takes a complete, point-in-time snapshot of every Data Bundles table — agents,
              stores, orders, ledgers, commissions, withdrawals, referrals, bundle prices, AFA
              registrations, settings, notifications, support, team and provider balances. Tables
              are discovered from the database itself, so nothing new gets left out.
            </p>
            <p className="mt-2 text-xs text-niki-ink/50">
              {storageSummary} Downloading to your computer needs no storage at all — the snapshot
              is built and sent straight to you, and nothing is kept here.
            </p>
          </div>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            disabled={!canStore}
            pendingLabel="Taking the snapshot…"
            icon={<DatabaseBackup className="h-4 w-4" />}
            className="rounded-xl bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Create Full Backup
          </SubmitButton>

          {/*
            The way out that depends on nothing. A plain anchor, so the browser
            does the downloading and no storage has to be configured, working
            or reachable for an admin to get a copy of their own database. It
            is always available — including while the stored path is broken,
            which is exactly when somebody needs it most.
          */}
          <a
            href="/admin/data/settings/backups/download-now"
            download
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-niki-ink/75 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
          >
            <HardDriveDownload className="h-4 w-4 text-niki-success" />
            Download backup to this computer
          </a>
          {state.ok && state.backupId ? (
            <a
              href={`/admin/data/settings/backups/${state.backupId}/download`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
            >
              <Download className="h-4 w-4 text-niki-success" />
              Download this backup
            </a>
          ) : null}
        </div>

        {!canStore ? (
          <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
            No backup storage is configured, so there is nowhere to keep a snapshot for later —
            set the DATA_BACKUP_S3_* variables for cloud storage, or DATA_BACKUP_LOCAL_DIR for a
            directory on the server. Downloading straight to your computer works regardless, and
            a file you keep somewhere safe is a real backup.
          </p>
        ) : null}

        <FormFeedback
          error={state.error}
          success={state.ok ? `Backup completed. ${state.summary ?? ""}`.trim() : undefined}
        />

        {state.ok && state.warning ? (
          <p className="rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900">{state.warning}</p>
        ) : null}

        {state.ok && !offsite ? (
          <p className="flex items-start gap-2 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This copy is on the server that holds the database. Download it now, and configure
              cloud storage so future backups land somewhere the server cannot take with it.
            </span>
          </p>
        ) : null}
      </form>
    </section>
  );
}
