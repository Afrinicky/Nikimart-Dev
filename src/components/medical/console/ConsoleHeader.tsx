import type { ReactNode } from "react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { cn } from "@/lib/cn";

/**
 * The title block every console section opens with: what this is, one line on
 * what it covers, and whatever action belongs to the section as a whole.
 */
export function ConsoleHeader({
  title,
  subtitle,
  icon: Icon,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  /** A link up to the list this detail page belongs to. */
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div>
      {back ? (
        <MedicalLink
          href={back.href}
          className="medi-focus medi-meta mb-3 inline-block rounded text-medi-muted transition-colors hover:text-medi-teal-700"
        >
          ← {back.label}
        </MedicalLink>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medi-mint-100 text-medi-teal-700">
              <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="medi-h1 text-[1.5rem]">{title}</h1>
            {subtitle ? (
              <p className="medi-prose mt-1 text-[0.875rem] text-medi-body">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

/** A heading inside a section — above a table, a panel, a group of fields. */
export function PanelHeading({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="medi-h3">{title}</h2>
        {subtitle ? <p className="medi-meta mt-0.5 text-medi-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/**
 * A metric tile.
 *
 * Every figure on it comes from a query. Nothing on this surface is a
 * placeholder, an estimate or a sample — a console that opens on invented
 * numbers is one nobody can trust afterwards, and the first wrong figure costs
 * the credibility of every right one beside it.
 *
 * The grids these sit in stack below 360px rather than holding two columns.
 * `GH₵6,670.00` is one unbreakable token, so in a 320px two-column grid the
 * track grows to fit it and the whole page scrolls sideways by a couple of
 * pixels. Breaking the number would be worse than stacking the cards, and
 * shrinking it would make the one thing on the card that matters the hardest
 * thing on it to read.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  /** `attention` for a figure that means somebody has to do something. */
  tone?: "default" | "attention";
}) {
  const body = (
    <>
      <p
        className={cn(
          "font-figures text-[1.375rem] font-bold leading-none",
          tone === "attention" ? "text-medi-warning" : "text-medi-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[0.8125rem] font-medium text-medi-body">{label}</p>
      {hint ? <p className="medi-meta mt-0.5 text-medi-muted">{hint}</p> : null}
    </>
  );

  if (!href) return <div className="medi-panel p-4">{body}</div>;

  return (
    <MedicalLink href={href} className="medi-panel medi-raise block p-4">
      {body}
    </MedicalLink>
  );
}
