import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Scale, TriangleAlert } from "lucide-react";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ActionLink } from "@/components/ui/motion";
import { DataAuditFindings } from "@/components/admin/DataAuditFindings";
import { formatMoney } from "@/lib/format";
import { formatWhen } from "@/components/agent/AgentUi";
import { runDataAudit, type AuditStatement } from "@/lib/data-bundles/audit";
import { RANGE_OPTIONS, transactionRange } from "@/lib/transaction-kinds";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Audit — Transactions — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The bundle business audited against its own rows.
 *
 * Everything here is recounted on each load from the orders, the agent ledgers
 * and the wallet readings, so there is no stored verdict that could be out of
 * date and nothing the report says can be contradicted by the tables it came
 * from. Opening the tab is running the audit; there is no button for it,
 * because a report you have to remember to refresh is a report that will be
 * read stale.
 *
 * Two statements first, because that is the order an auditor asks in: what did
 * the business earn, and does the float agree with what went through it. The
 * findings follow, worst first, each with the one correction that is safe to
 * apply — or, where the missing piece is a fact nobody wrote down, what to do
 * instead of guessing.
 */
export default async function DataAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const days = transactionRange(params.range);
  const windowLabel =
    RANGE_OPTIONS.find((r) => r.value === String(days))?.label.toLowerCase() ?? "this period";

  const report = await runDataAudit(days, windowLabel);
  const { totals } = report;
  const settled = totals.exceptions === 0 && totals.advisory === 0;
  const reconciles = Math.abs(report.unaccounted) < 0.5;

  return (
    <div className="space-y-5">
      {/* The verdict, before any of the detail that produced it. */}
      <section
        className={cn(
          "rounded-2xl p-6 ring-1",
          settled && reconciles
            ? "bg-niki-success/[0.06] ring-niki-success/25"
            : totals.exceptions > 0
              ? "bg-niki-danger/[0.06] ring-niki-danger/20"
              : "bg-amber-50 ring-amber-200",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                settled && reconciles
                  ? "bg-niki-success/15 text-emerald-700"
                  : totals.exceptions > 0
                    ? "bg-niki-danger/12 text-niki-danger"
                    : "bg-niki-gold/25 text-amber-800",
              )}
            >
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-niki-ink">
                {settled && reconciles
                  ? "The books reconcile"
                  : totals.exceptions > 0
                    ? "The books do not reconcile"
                    : "The books reconcile, with observations"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-niki-ink/65">
                {totals.checks} checks run against the orders, the agent ledgers and the provider
                wallet, {windowLabel}. Recounted on every load — nothing here is a stored verdict.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tally icon={CircleCheck} label="Passed" value={totals.clean} tone="good" />
            <Tally icon={TriangleAlert} label="Advisory" value={totals.advisory} tone="warn" />
            <Tally icon={CircleAlert} label="Exceptions" value={totals.exceptions} tone="bad" />
          </div>
        </div>
        <p className="mt-4 text-xs text-niki-ink/45">Run {formatWhen(report.runAt)}</p>
      </section>

      {/* Links rather than a dropdown: the period is part of the address, so a
          report can be sent to somebody and open on the same figures. */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Audit period">
        {RANGE_OPTIONS.map((option) => (
          <ActionLink
            key={option.value}
            href={`/admin/data/transactions/audit?range=${option.value}`}
            aria-current={option.value === String(days) ? "page" : undefined}
            className={cn(
              "rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors",
              option.value === String(days)
                ? "bg-niki-ink text-white"
                : "bg-white text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-surface",
            )}
          >
            {option.label}
          </ActionLink>
        ))}
      </nav>

      {/* The two statements. Income and expenditure answers "what did we
          earn"; the float answers "and does the money agree". */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Statement
          title="Income and expenditure"
          subtitle={`Bundle trading, ${windowLabel}.`}
          lines={report.trading}
        />
        <Statement
          title="Provider float position"
          subtitle={`Everything in and out of the wallet the bundles are bought from, ${windowLabel}.`}
          lines={report.float}
          footer={
            <div
              className={cn(
                "mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
                reconciles
                  ? "bg-niki-success/10 text-emerald-700"
                  : "bg-niki-danger/10 text-niki-danger",
              )}
            >
              <span>Unaccounted</span>
              <span className="font-figures tabular-nums">
                {reconciles ? formatMoney(0) : formatMoney(report.unaccounted)}
              </span>
            </div>
          }
        />
      </div>

      <section>
        <PanelHeading
          title="Checks"
          subtitle="Worst first. A correction is offered only where the rows already imply the right answer."
        />
        <DataAuditFindings findings={report.findings} />
      </section>
    </div>
  );
}

function Tally({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
}) {
  const tones = {
    good: "bg-white text-emerald-700 ring-niki-success/25",
    warn: "bg-white text-amber-800 ring-niki-gold/35",
    bad: "bg-white text-niki-danger ring-niki-danger/25",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1",
        tones[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-figures text-base font-bold tabular-nums">{value}</span>
      {label}
    </span>
  );
}

/**
 * A statement, ruled the way one is on paper: components in light type, totals
 * ruled off above them, and a subtraction written as one rather than as a
 * negative number somebody has to notice the sign of.
 */
function Statement({
  title,
  subtitle,
  lines,
  footer,
}: {
  title: string;
  subtitle: string;
  lines: AuditStatement[];
  footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <PanelHeading title={title} subtitle={subtitle} />
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-niki-ink/45">
          Nothing to read — the tables behind this statement are not available.
        </p>
      ) : (
        <dl className="space-y-0">
          {lines.map((line, i) => (
            <div
              key={`${line.label}-${i}`}
              className={cn(
                "flex items-baseline justify-between gap-4 py-2.5",
                line.total && "mt-1 border-t border-niki-edge-strong pt-3",
              )}
            >
              <dt className="min-w-0">
                <span
                  className={cn(
                    "block text-sm",
                    line.total ? "font-semibold text-niki-ink" : "text-niki-ink/70",
                  )}
                >
                  {line.label}
                </span>
                {line.note ? (
                  <span className="mt-0.5 block text-xs text-niki-ink/40">{line.note}</span>
                ) : null}
              </dt>
              <dd
                className={cn(
                  "shrink-0 whitespace-nowrap font-figures tabular-nums",
                  line.total ? "text-base font-bold text-niki-ink" : "text-sm text-niki-ink/80",
                  line.negative && "text-niki-danger",
                )}
              >
                {line.negative ? "−" : ""}
                {formatMoney(Math.abs(line.amount))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {footer}
    </section>
  );
}
