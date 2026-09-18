import { ActionLink } from "@/components/ui/motion";

/**
 * Where every order in the window ended up, as one bar.
 *
 * Status is a state, not a series, so it wears the reserved status colours and
 * never the chart palette — and each one carries a written label beside its
 * swatch, so the state is never colour alone. The segments are separated by a
 * gap in the surface rather than by a stroke around each one: a border would
 * add ink that isn't data.
 *
 * The steps are darker than the brand's own success and danger tokens, which
 * are tuned for text and pills and fall under 3:1 against white as a fill.
 */

export interface StatusSlice {
  key: string;
  label: string;
  count: number;
  colour: string;
  href: string;
}

export function StatusBar({ slices }: { slices: StatusSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
        No paid orders in this window.
      </p>
    );
  }

  const shown = slices.filter((s) => s.count > 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {shown.map((s) => (
          <div
            key={s.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.count / total) * 100}%`, background: s.colour }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-1">
        {slices.map((s) => (
          <li key={s.key}>
            <ActionLink
              href={s.href}
              className="niki-focus -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-niki-surface/70"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.colour }}
              />
              <span className="flex-1 truncate text-sm text-niki-ink/70">{s.label}</span>
              <span className="font-figures text-sm font-bold text-niki-ink">{s.count}</span>
              <span className="w-10 shrink-0 text-right text-[11px] text-niki-ink/45">
                {Math.round((s.count / total) * 100)}%
              </span>
            </ActionLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
