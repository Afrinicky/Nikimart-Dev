"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck, ExternalLink, TriangleAlert, Wrench } from "lucide-react";
import { ActionLink, SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { formatMoney } from "@/lib/format";
import { applyCorrection, type AuditActionState } from "@/lib/data-bundles/audit-actions";
import { cn } from "@/lib/cn";

/**
 * The findings, each with whatever can be done about it.
 *
 * Three states and they are kept visually distinct, because the whole value of
 * an audit is being able to tell at a glance which rows need a person. A clean
 * check still prints: a report that lists only problems cannot be told apart
 * from a report that failed to run.
 *
 * A correction is a button only where the console can write the right answer —
 * where two of our own tables disagree, the ledger is right and the cache is
 * wrong, and there is nothing to decide. Where the missing piece is a fact
 * nobody recorded, there is no button, and the card says what to do instead.
 * Inventing the fact would be the worst thing an audit tool could do.
 */

export interface AuditFindingView {
  key: string;
  title: string;
  test: string;
  severity: "clean" | "advisory" | "exception";
  outcome: string;
  count: number;
  amount: number | null;
  href?: string;
  hrefLabel?: string;
  fix?: { action: string; label: string; effect: string };
  remedy?: string;
}

const TONES = {
  exception: {
    icon: CircleAlert,
    chip: "bg-niki-danger/10 text-niki-danger",
    label: "Exception",
    pill: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
  },
  advisory: {
    icon: TriangleAlert,
    chip: "bg-niki-gold/20 text-amber-800",
    label: "Advisory",
    pill: "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30",
  },
  clean: {
    icon: CircleCheck,
    chip: "bg-niki-success/12 text-emerald-700",
    label: "Passed",
    pill: "bg-niki-success/12 text-emerald-700 ring-1 ring-niki-success/25",
  },
} as const;

export function DataAuditFindings({ findings }: { findings: AuditFindingView[] }) {
  const [state, formAction] = useActionState<AuditActionState, FormData>(applyCorrection, {});

  return (
    <>
      {/* Above the list rather than inside a card. A correction that works
          turns its own check green and takes its button away with it, so a
          message anchored to that card would vanish in the same render and the
          admin would press the button and be told nothing at all. */}
      <FormFeedback
        error={state.error}
        success={state.ok ? state.message : undefined}
        className="mb-3"
      />
      <ul className="space-y-3">
      {findings.map((finding) => {
        const tone = TONES[finding.severity];
        const Icon = tone.icon;
        return (
          <li
            key={finding.key}
            className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    tone.chip,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-niki-ink">
                    {finding.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-niki-ink/45">{finding.test}</p>
                  <p
                    className={cn(
                      "mt-2 text-sm leading-snug",
                      finding.severity === "clean" ? "text-niki-ink/60" : "text-niki-ink",
                    )}
                  >
                    {finding.outcome}
                  </p>
                  {finding.remedy ? (
                    <p className="mt-2 rounded-xl bg-niki-surface/70 px-3.5 py-2.5 text-[13px] leading-snug text-niki-ink/65">
                      {finding.remedy}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* A row on a phone and a column on a desktop. Stacked, the
                  verdict and the figure end up adrift under the prose with the
                  card's right edge nowhere near them; side by side they stay a
                  summary of the card above. */}
              <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:justify-start sm:gap-2">
                <span className={cn("rounded-lg px-2.5 py-1 text-[11px] font-bold", tone.pill)}>
                  {tone.label}
                </span>
                {finding.amount !== null && finding.amount > 0 ? (
                  <span className="font-figures text-lg font-bold tabular-nums text-niki-ink">
                    {formatMoney(finding.amount)}
                  </span>
                ) : null}
                {finding.href && finding.severity !== "clean" ? (
                  <ActionLink
                    href={finding.href}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-niki-trust hover:underline"
                  >
                    {finding.hrefLabel ?? "View the rows"}
                    <ExternalLink className="h-3 w-3" />
                  </ActionLink>
                ) : null}
              </div>
            </div>

            {finding.fix ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-niki-edge pt-4">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-niki-ink/60">
                  {finding.fix.effect}
                </p>
                <form action={formAction}>
                  <input type="hidden" name="action" value={finding.fix.action} />
                  <SubmitButton
                    pendingLabel="Correcting…"
                    className="inline-flex items-center gap-2 rounded-xl bg-niki-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-ink/85"
                  >
                    <Wrench className="h-4 w-4" />
                    {finding.fix.label}
                  </SubmitButton>
                </form>
              </div>
            ) : null}

          </li>
        );
      })}
      </ul>
    </>
  );
}
