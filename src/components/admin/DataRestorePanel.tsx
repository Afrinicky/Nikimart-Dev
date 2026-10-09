"use client";

import { useActionState, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { inputClass } from "@/components/ui/Field";
import {
  executeRestore,
  previewRestore,
  type RestorePreviewState,
  type RestoreRunState,
} from "@/lib/data-bundles/restore-actions";
import { cn } from "@/lib/cn";

/**
 * Restoring the bundle database, as a sequence the admin cannot shortcut.
 *
 * Pick a file, read what it would do, type the phrase, then — and only then —
 * does the dangerous button exist at all. The confirmation input is rendered
 * only after a successful inspection, so there is no state in which someone
 * can type the phrase into a form that has not yet shown them what they are
 * about to overwrite.
 *
 * The phrase is checked here to enable the button and again on the server,
 * which is the check that counts; this one just stops the button looking
 * available when it isn't.
 */

export interface RestorableBackup {
  id: string;
  /** Everything the admin needs to tell one backup from another, in one line. */
  label: string;
}

const CONFIRMATION = "RESTORE DATA BUNDLES";

export function DataRestorePanel({ backups }: { backups: RestorableBackup[] }) {
  const [selected, setSelected] = useState(backups[0]?.id ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploaded, setUploaded] = useState<RestorableBackup[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, previewAction] = useActionState<RestorePreviewState, FormData>(
    previewRestore,
    {},
  );
  const [run, runAction] = useActionState<RestoreRunState, FormData>(executeRestore, {});

  const options = [...uploaded, ...backups];
  const plan = preview.plan;
  // The inspection has to be of the backup currently chosen — changing the
  // selection after inspecting must not leave a stale confirmation on screen.
  const planMatches = Boolean(plan && preview.backupId === selected);
  const canRestore = planMatches && plan!.blockers.length === 0 && confirmation.trim() === CONFIRMATION;

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    setUploadNote("");
    try {
      const res = await fetch("/admin/data/settings/backups/upload", {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/gzip" },
      });
      const body = await res.json();
      if (!res.ok) {
        setUploadError(body?.error ?? "The upload failed.");
        return;
      }
      const entry: RestorableBackup = {
        id: body.id,
        label: `Uploaded · ${file.name} · ${body.tableCount} tables · ${Number(body.recordCount).toLocaleString("en-GB")} records`,
      };
      setUploaded((prev) => [entry, ...prev]);
      setSelected(body.id);
      setConfirmation("");
      setUploadNote(`${file.name} checked and stored. Inspect it before restoring.`);
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setUploadError("The upload could not be sent.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-niki-danger/35 bg-niki-danger/[0.04] p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-danger/10 text-niki-danger">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-niki-danger">
            Restore from a backup — dangerous
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-niki-ink/70">
            Restoring empties every table the backup covers and rewrites it from the file. Orders,
            ledger entries and balances written since that snapshot are gone. A safety backup of
            the current database is taken first, automatically, and the restore stops if it fails.
          </p>

          {/* 1 — which file */}
          <div className="mt-5 rounded-xl bg-white p-4 ring-1 ring-niki-edge">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
              Step 1 — choose a backup
            </p>
            <form action={previewAction} className="mt-3 space-y-3">
              <select
                name="backupId"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setConfirmation("");
                }}
                className={inputClass}
                aria-label="Backup to restore"
              >
                {options.length === 0 ? <option value="">No backups available</option> : null}
                {options.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton
                  disabled={!selected}
                  pendingLabel="Checking the file…"
                  icon={<RotateCcw className="h-4 w-4" />}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-niki-ink/75 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
                >
                  Inspect this backup
                </SubmitButton>

                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-niki-ink/60 ring-1 ring-niki-edge-control transition-colors hover:bg-niki-surface",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Checking…" : "Upload a backup file"}
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".gz,application/gzip"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                </label>
              </div>
            </form>

            {uploadError ? (
              <p className="mt-3 rounded-lg bg-niki-danger/10 px-3 py-2 text-sm font-medium text-niki-danger">
                {uploadError}
              </p>
            ) : null}
            {uploadNote ? (
              <p className="mt-3 rounded-lg bg-niki-success/10 px-3 py-2 text-sm font-medium text-emerald-700">
                {uploadNote}
              </p>
            ) : null}
            {preview.error ? (
              <p className="mt-3 rounded-lg bg-niki-danger/10 px-3 py-2 text-sm font-medium text-niki-danger">
                {preview.error}
              </p>
            ) : null}
          </div>

          {/* 2 — what it would do */}
          {planMatches ? (
            <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-niki-edge">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
                Step 2 — what this backup holds
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Taken" value={new Date(plan!.meta.takenAt).toLocaleString("en-GB")} />
                <Detail label="From database" value={plan!.meta.databaseId} mono />
                <Detail label="Schema version" value={plan!.meta.schemaVersion} mono />
                <Detail label="Backup ID" value={plan!.meta.id} mono />
                <Detail label="Tables to restore" value={String(plan!.tables.length)} />
                <Detail label="Records to restore" value={plan!.totalRows.toLocaleString("en-GB")} />
                <Detail label="App version" value={plan!.meta.appVersion} mono />
                <Detail label="Format" value={`${plan!.meta.format}/${plan!.meta.formatVersion}`} mono />
              </dl>

              {plan!.blockers.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {plan!.blockers.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2 rounded-lg bg-niki-danger/10 px-3 py-2 text-sm text-niki-danger"
                    >
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {plan!.warnings.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {plan!.warnings.map((w) => (
                    <li
                      key={w}
                      className="flex items-start gap-2 rounded-lg bg-niki-gold/15 px-3 py-2 text-sm text-amber-900"
                    >
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {plan!.blockers.length === 0 && plan!.warnings.length === 0 ? (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-niki-success/10 px-3 py-2 text-sm text-emerald-700">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This backup matches the live schema exactly.</span>
                </p>
              ) : null}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-niki-ink/60">
                  Per-table record counts ({plan!.tables.length})
                </summary>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {plan!.tables.map((t) => (
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
              </details>
            </div>
          ) : null}

          {/* 3 — confirm, in as many words */}
          {planMatches && plan!.blockers.length === 0 ? (
            <form action={runAction} className="mt-4 rounded-xl bg-white p-4 ring-1 ring-niki-danger/30">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-danger/80">
                Step 3 — confirm
              </p>
              <input type="hidden" name="backupId" value={selected} />
              <p className="mt-2 text-sm text-niki-ink/70">
                This will replace {plan!.tables.length} tables with{" "}
                {plan!.totalRows.toLocaleString("en-GB")} records from{" "}
                {new Date(plan!.meta.takenAt).toLocaleString("en-GB")}. Type{" "}
                <code className="rounded bg-niki-surface px-1.5 py-0.5 font-mono text-xs font-bold">
                  {CONFIRMATION}
                </code>{" "}
                to continue.
              </p>
              <input
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={CONFIRMATION}
                autoComplete="off"
                spellCheck={false}
                aria-label="Confirmation phrase"
                className={`${inputClass} mt-3 font-mono`}
              />
              <div className="mt-3">
                <SubmitButton
                  disabled={!canRestore}
                  pendingLabel="Restoring — do not close this page…"
                  icon={<RotateCcw className="h-4 w-4" />}
                  className="rounded-xl bg-niki-danger px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-danger/90"
                >
                  Restore this backup
                </SubmitButton>
              </div>

              <FormFeedback
                className="mt-3"
                error={run.error}
                success={
                  run.ok
                    ? `Restored ${run.tables} tables and ${(run.rows ?? 0).toLocaleString("en-GB")} records, and verified every row count.`
                    : undefined
                }
              />

              {run.safetyBackupId ? (
                <p className="mt-3 rounded-lg bg-niki-surface px-3 py-2 text-xs text-niki-ink/65">
                  The database as it was before this restore was saved as{" "}
                  <span className="font-mono">{run.safetyBackupId}</span>. It is in the backup
                  history above, and restoring it undoes this.
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-sm text-niki-ink ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
