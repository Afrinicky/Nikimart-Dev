import { ChevronRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { cn } from "@/lib/cn";

/**
 * One record in an account list: a reference, what it is, and where it stands.
 *
 * A list rather than a table, because this is three or four facts about one
 * thing and a customer reads them as a sentence — and because a table of four
 * columns on a 360px screen is a sideways scroll on the page somebody opens on
 * their phone to check whether their quotation has arrived.
 *
 * The whole row is the link when there is somewhere to go. The chevron is
 * decoration; the reference is the accessible name.
 */
export function AccountRow({
  href,
  reference,
  meta,
  status,
  amount,
  className,
}: {
  href?: string;
  reference: string;
  /** The quiet line under the reference: dates, counts, what it contains. */
  meta: string;
  status?: React.ReactNode;
  amount?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block font-figures text-sm font-semibold text-medi-ink">{reference}</span>
        <span className="medi-meta mt-0.5 block text-medi-muted">{meta}</span>
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-3">
        {amount ? (
          <span className="font-figures text-sm font-semibold text-medi-ink">{amount}</span>
        ) : null}
        {status}
        {href ? (
          <ChevronRight className="h-4 w-4 text-medi-muted" aria-hidden />
        ) : null}
      </span>
    </>
  );

  const shell = cn(
    "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:flex-nowrap",
    className,
  );

  if (!href) return <li className={shell}>{body}</li>;

  return (
    <li>
      <MedicalLink
        href={href}
        className={cn(shell, "medi-focus group transition-colors hover:bg-medi-mint-50")}
      >
        {body}
      </MedicalLink>
    </li>
  );
}

/** A panel of rows, with a heading and an action beside it. */
export function AccountPanel({
  title,
  action,
  children,
  empty,
  isEmpty,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** What to say when there is nothing. Said plainly; never a promise. */
  empty: React.ReactNode;
  isEmpty: boolean;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <h2 className="medi-h3 text-medi-ink">{title}</h2>
        {action}
      </div>

      <div className="medi-panel mt-3 overflow-hidden">
        {isEmpty ? (
          <div className="px-4 py-6">{empty}</div>
        ) : (
          <ul className="divide-y divide-medi-rule">{children}</ul>
        )}
      </div>
    </section>
  );
}
