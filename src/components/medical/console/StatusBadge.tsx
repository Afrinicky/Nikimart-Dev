import { cn } from "@/lib/cn";

/**
 * A status, as a word in a tinted pill.
 *
 * Colour is never the only signal — every badge carries its own label, so the
 * same fact is readable to somebody who cannot distinguish the amber from the
 * green, and in a printed purchase order, and in a screenshot pasted into an
 * email. The tone is a hint; the word is the status.
 *
 * Tones map to meaning rather than to colour names, so a screen asks for
 * "this is waiting on somebody" rather than for "the amber one".
 */

export type Tone = "neutral" | "progress" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-medi-surface text-medi-muted shadow-[inset_0_0_0_1px_var(--color-medi-rule)]",
  progress: "bg-medi-mint-100 text-medi-teal-800",
  good: "bg-medi-success-soft text-medi-success",
  warn: "bg-medi-warning-soft text-medi-warning",
  bad: "bg-medi-danger-soft text-medi-danger",
  info: "bg-medi-info-soft text-medi-info",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-[0.6875rem] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Build a status vocabulary once, use it everywhere.
 *
 * Each domain declares its statuses and tones in one map and renders them
 * through this, so "AWAITING_PAYMENT" is the same words and the same colour on
 * the list, on the detail page and in the export.
 */
export function makeStatus<T extends string>(
  map: Record<T, { label: string; tone: Tone }>,
): {
  Badge: (props: { status: T; className?: string }) => React.ReactElement;
  label: (status: T) => string;
  options: { value: T; label: string }[];
} {
  return {
    Badge: ({ status, className }) => {
      const entry = map[status] ?? { label: humanise(status), tone: "neutral" as const };
      return <StatusBadge label={entry.label} tone={entry.tone} className={className} />;
    },
    label: (status) => map[status]?.label ?? humanise(status),
    options: (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].label })),
  };
}

/** A status the map does not know about still reads as words, not SCREAMING_SNAKE. */
function humanise(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
