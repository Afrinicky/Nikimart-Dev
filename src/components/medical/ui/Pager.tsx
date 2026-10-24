import { ChevronLeft, ChevronRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { cn } from "@/lib/cn";

/**
 * Previous and next, with the position between them.
 *
 * Real links with real hrefs, not buttons that push state: a catalogue page
 * deep in a category is a page somebody sends to a colleague, and it has to
 * survive being pasted into an email.
 */
export function Pager({
  page,
  pageCount,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-4", className)}
    >
      <PagerLink href={hrefFor(page - 1)} disabled={page <= 1} direction="prev" />
      <p className="medi-meta text-medi-muted">
        Page <span className="font-figures font-semibold text-medi-ink">{page}</span> of{" "}
        <span className="font-figures font-semibold text-medi-ink">{pageCount}</span>
      </p>
      <PagerLink href={hrefFor(page + 1)} disabled={page >= pageCount} direction="next" />
    </nav>
  );
}

function PagerLink({
  href,
  disabled,
  direction,
}: {
  href: string;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const label = direction === "prev" ? "Previous" : "Next";
  const icon =
    direction === "prev" ? (
      <ChevronLeft className="h-4 w-4" aria-hidden />
    ) : (
      <ChevronRight className="h-4 w-4" aria-hidden />
    );

  if (disabled) {
    // Rendered as a disabled span rather than omitted, so the two controls keep
    // their places and the row does not reflow as you page through.
    return (
      <span
        aria-disabled
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[0.8125rem] font-semibold text-medi-disabled"
      >
        {direction === "prev" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </span>
    );
  }

  return (
    <MedicalLink
      href={href}
      rel={direction}
      className="medi-focus inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[0.8125rem] font-semibold text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] transition-colors hover:text-medi-teal-700"
    >
      {direction === "prev" ? icon : null}
      {label}
      {direction === "next" ? icon : null}
    </MedicalLink>
  );
}
