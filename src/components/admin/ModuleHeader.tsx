import type { ReactNode } from "react";

/**
 * The title block every console module opens with: an icon, what this module
 * is, one line on what it covers, and whatever action belongs to the whole
 * module rather than to one of its tabs.
 */
export function ModuleHeader({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
            <Icon className="h-4.5 w-4.5" />
          </span>
        ) : null}
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-niki-ink/60">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/** The section heading used inside a tab panel. */
export function PanelHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold text-niki-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-niki-ink/60">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
