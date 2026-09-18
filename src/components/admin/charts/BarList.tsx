import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * A ranked list where the bar is the magnitude and the number is the answer.
 *
 * Not a pie and not a stacked bar: with four or five named things the question
 * is "which is biggest, and by how much", and a length against a common
 * baseline answers that better than an angle. One hue throughout — length is
 * the encoding, so a second colour would only be decoration, and every row is
 * labelled with its own figure so nothing depends on reading the bar.
 */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** The second figure, e.g. how many orders made that revenue. */
  note?: string;
  /** Where this row's number comes from. */
  href?: string;
}

export function BarList({
  rows,
  format,
  empty = "Nothing yet.",
}: {
  rows: BarRow[];
  format: (value: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
        {empty}
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-niki-ink">{row.label}</span>
              <span className="shrink-0 font-figures text-sm font-bold text-niki-ink">
                {format(row.value)}
                {row.note ? (
                  <span className="ml-1.5 font-sans text-[11px] font-medium text-niki-ink/45">
                    {row.note}
                  </span>
                ) : null}
              </span>
            </div>
            {/* 6px track, 4px rounded end, grown from a single baseline. */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-niki-surface">
              <div
                className="h-full rounded-full bg-niki-orange"
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <ActionLink
                href={row.href}
                className={cn(
                  "niki-focus block rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-niki-surface/70",
                )}
              >
                {body}
              </ActionLink>
            ) : (
              <div className="px-2 py-1.5 -mx-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
