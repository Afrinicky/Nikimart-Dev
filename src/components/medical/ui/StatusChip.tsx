import { StatusBadge } from "@/components/medical/console/StatusBadge";
import type { StatusLabel } from "@/lib/medical/account/status-labels";

/**
 * A status from the customer's vocabulary, as a badge.
 *
 * The same pill the console uses — one company, one way of showing a state —
 * reading from the customer-facing map rather than the internal one. An
 * unknown status still renders as words rather than as a missing element,
 * because a row with no status at all is worse than one with a vague status.
 */
export function StatusChip({
  entry,
  fallback = "Unknown",
  className,
}: {
  entry: StatusLabel | undefined;
  fallback?: string;
  className?: string;
}) {
  return (
    <StatusBadge
      label={entry?.label ?? fallback}
      tone={entry?.tone ?? "neutral"}
      className={className}
    />
  );
}
