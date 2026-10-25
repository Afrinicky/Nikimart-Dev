import { ChevronRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";

/**
 * Where you are, and the way back up.
 *
 * The catalogue nests two deep and a buyer arrives on a product page straight
 * from a search engine as often as from the homepage. Without this they have
 * no idea which department they are in, and the only way out is the browser's
 * back button to a page they never visited.
 */
export function Breadcrumbs({
  trail,
}: {
  /** Root first. The last entry is the current page and is not a link. */
  trail: { href?: string; label: string }[];
}) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            // `min-w-0` so a long last crumb can shrink, and the label below
            // wraps rather than running off the side. A product called
            // "Semi-automated clinical chemistry analyser" pushed the page 12px
            // wider than a 320px screen, which is a horizontal scrollbar on
            // every page of the catalogue for anyone on a small phone.
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-medi-disabled" aria-hidden />
              ) : null}
              {last || !crumb.href ? (
                <span
                  className="medi-meta min-w-0 break-words text-medi-muted"
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <MedicalLink
                  href={crumb.href}
                  className="medi-meta medi-focus min-w-0 break-words rounded text-medi-body transition-colors hover:text-medi-teal-700"
                >
                  {crumb.label}
                </MedicalLink>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
