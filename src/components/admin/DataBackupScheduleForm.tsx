"use client";

import { useActionState } from "react";
import { CalendarClock, CircleAlert, CircleCheck, CircleSlash } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatWhen } from "@/components/agent/AgentUi";
import {
  updateBackupSchedule,
  type BackupScheduleState,
} from "@/lib/data-bundles/backup-actions";
import type { AutoBackupStatus } from "@/lib/data-bundles/backup-schedule";
import { cn } from "@/lib/cn";

/**
 * Automatic backups: whether they run, how much history they keep, and whether
 * the last one worked.
 *
 * The state line is the point of the panel. A schedule that has quietly been
 * failing for three weeks looks exactly like one that has been working, right
 * up until the morning somebody needs it — so "when did one last succeed" and
 * "what went wrong with the most recent attempt" are both on screen without
 * anyone having to read the history table.
 *
 * Retention is per tier and counted in snapshots, not days. Zero is a real
 * answer for a tier nobody wants; all three at zero is refused server-side,
 * because that would delete each snapshot as the next arrived.
 */
export function DataBackupScheduleForm({ status }: { status: AutoBackupStatus }) {
  const [state, formAction] = useActionState<BackupScheduleState, FormData>(
    updateBackupSchedule,
    {},
  );

  const last = status.lastRun;
  const failing = last?.status === "failed";

  // Four states, in the order an admin cares about: broken, off, on but
  // blocked by the environment, on and working.
  const tone = failing || status.blocker ? "bad" : status.enabled ? "good" : "idle";

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              tone === "bad" && "bg-niki-danger/10 text-niki-danger",
              tone === "good" && "bg-niki-success/12 text-emerald-700",
              tone === "idle" && "bg-niki-surface text-niki-ink/45",
            )}
          >
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Automatic backups</h2>
            <p className="mt-1 max-w-xl text-sm text-niki-ink/60">
              One snapshot a night, labelled by the longest period it opens — the first run of a
              month is that month&apos;s, the first of a week is that week&apos;s, the rest are
              dailies. Older ones are deleted once each tier is over its limit.
            </p>
          </div>
        </div>
        <StatePill enabled={status.enabled} blocked={Boolean(status.blocker)} failing={failing} />
      </div>

      {/* What happened last night, which is the question this panel exists for. */}
      <div className="mt-5 rounded-xl bg-niki-surface/60 px-4 py-3">
        {last ? (
          <div className="flex items-start gap-2 text-sm">
            {last.status === "completed" ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-niki-danger" />
            )}
            <div className="min-w-0">
              <p className={cn("font-semibold", failing ? "text-niki-danger" : "text-niki-ink")}>
                Last automatic backup {last.status === "completed" ? "succeeded" : "failed"} —{" "}
                {/* Just the tier word: the full label already says "Automatic", and
                    "Last automatic backup succeeded — automatic — daily" is nonsense. */}
                {last.kind.replace("auto-", "")}, {formatWhen(last.startedAt)}
              </p>
              {last.error ? (
                <p className="mt-1 text-[13px] leading-snug text-niki-danger">{last.error}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-niki-ink/60">
            <CircleSlash className="h-4 w-4 shrink-0 text-niki-ink/35" />
            No automatic backup has run yet.
          </p>
        )}
      </div>

      {status.blocker ? (
        <p className="mt-3 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
          {status.blocker}
        </p>
      ) : null}

      {status.enabled && !status.blocker && !status.offsite ? (
        <p className="mt-3 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-900 ring-1 ring-niki-gold/30">
          Scheduled snapshots are being written to this server&apos;s disk. That survives a restart
          but not the loss of the server, which is the case a backup is for. Configure
          <code className="mx-1 font-mono text-xs">DATA_BACKUP_S3_*</code> so a copy lands off-site.
        </p>
      ) : null}

      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Schedule" htmlFor="backupAutoEnabled" hint="Runs nightly at 02:17 UTC">
            <select
              id="backupAutoEnabled"
              name="backupAutoEnabled"
              defaultValue={status.enabled ? "1" : "0"}
              className={inputClass}
            >
              <option value="1">On — take a snapshot every night</option>
              <option value="0">Off — manual backups only</option>
            </select>
          </Field>
          <Retain
            name="backupRetainDaily"
            label="Daily to keep"
            value={status.retention.daily}
            held={status.held.daily}
          />
          <Retain
            name="backupRetainWeekly"
            label="Weekly to keep"
            value={status.retention.weekly}
            held={status.held.weekly}
          />
          <Retain
            name="backupRetainMonthly"
            label="Monthly to keep"
            value={status.retention.monthly}
            held={status.held.monthly}
          />
        </div>

        <p className="text-xs text-niki-ink/50">
          Retention applies only to automatic snapshots. Manual backups, uploads and the safety
          copy taken before a restore are never deleted by the schedule.
        </p>

        <FormFeedback error={state.error} success={state.ok ? "Schedule saved." : undefined} />

        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-xl bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          Save schedule
        </SubmitButton>
      </form>
    </section>
  );
}

function StatePill({
  enabled,
  blocked,
  failing,
}: {
  enabled: boolean;
  blocked: boolean;
  failing: boolean;
}) {
  const [label, className] = failing
    ? ["Failing", "bg-niki-danger/10 text-niki-danger"]
    : blocked && enabled
      ? ["On, but blocked", "bg-niki-gold/20 text-amber-900"]
      : enabled
        ? ["On", "bg-niki-success/12 text-emerald-700"]
        : ["Off", "bg-niki-ink/10 text-niki-ink/55"];

  return (
    <span className={cn("rounded-lg px-2.5 py-1.5 text-xs font-bold", className)}>{label}</span>
  );
}

function Retain({
  name,
  label,
  value,
  held,
}: {
  name: string;
  label: string;
  value: number;
  held: number;
}) {
  return (
    <Field label={label} htmlFor={name} hint={`${held} kept now`}>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        max="3650"
        step="1"
        defaultValue={value}
        className={inputClass}
      />
    </Field>
  );
}
