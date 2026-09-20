import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The tiles at the top of the team.
 *
 * A figure with a shape behind it: the bar says how much of the whole this
 * one is, which turns "seven active" into "seven of nine" without a second
 * line of text. Drawn rather than written because a leader reads this in a
 * glance between orders.
 */
export function StatTile({
  label,
  value,
  hint,
  of,
  tone = "ink",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  /** What this is part of, for the bar. Omit and no bar is drawn. */
  of?: { part: number; whole: number };
  tone?: "ink" | "success" | "orange" | "trust";
  delta?: number | null;
}) {
  const tones = {
    ink: { text: "text-niki-ink", bar: "bg-niki-ink/35" },
    success: { text: "text-niki-success", bar: "bg-niki-success" },
    orange: { text: "text-niki-orange", bar: "bg-niki-orange" },
    trust: { text: "text-niki-trust", bar: "bg-niki-trust" },
  } as const;

  const share =
    of && of.whole > 0 ? Math.max(2, Math.min(100, (of.part / of.whole) * 100)) : null;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className={cn("font-figures text-xl font-bold sm:text-2xl", tones[tone].text)}>
          {value}
        </p>
        {delta === null || delta === undefined ? null : (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
              delta >= 0
                ? "bg-niki-success/10 text-niki-success"
                : "bg-niki-danger/10 text-niki-danger",
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {share === null ? null : (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-niki-surface">
          <div
            className={cn("h-full rounded-full transition-[width]", tones[tone].bar)}
            style={{ width: `${share}%` }}
          />
        </div>
      )}
      {hint ? <p className="mt-1.5 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

/**
 * A team's shape as a single bar: selling, going quiet, gone, never started.
 *
 * Four numbers that only mean something against each other, so they are drawn
 * against each other rather than listed as four tiles.
 */
export function ActivityBar({
  counts,
}: {
  counts: { active: number; quiet: number; dormant: number; never: number };
}) {
  const slices = [
    { key: "active", label: "Selling", value: counts.active, fill: "bg-niki-success" },
    { key: "quiet", label: "Going quiet", value: counts.quiet, fill: "bg-amber-400" },
    { key: "dormant", label: "Dormant", value: counts.dormant, fill: "bg-niki-ink/25" },
    { key: "never", label: "Not started", value: counts.never, fill: "bg-niki-trust/60" },
  ].filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
        Nobody in your team yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {slices.map((s) => (
          <div
            key={s.key}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", s.fill)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", s.fill)} />
            <span className="flex-1 text-niki-ink/65">{s.label}</span>
            <span className="font-figures font-bold text-niki-ink">{s.value}</span>
            <span className="w-10 text-right text-xs text-niki-ink/40">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
