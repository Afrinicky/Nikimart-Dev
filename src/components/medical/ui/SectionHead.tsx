import { ArrowRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { cn } from "@/lib/cn";

/**
 * A section's heading, and the link to the whole of whatever it samples.
 *
 * No tracked uppercase kicker above the heading. That pattern — a tiny
 * all-caps label over every section title — is the single most reliable tell
 * of a page that was assembled from a template rather than written, and a
 * heading that needs a label above it to be understood is a heading that needs
 * rewriting. The optional line underneath is a sentence, in sentence case,
 * saying something the heading does not.
 */
export function SectionHead({
  title,
  description,
  href,
  linkLabel = "View all",
  className,
  as: Tag = "h2",
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        <Tag className="medi-h2">{title}</Tag>
        {description ? (
          <p className="medi-prose mt-1.5 text-[0.9375rem] text-medi-body">{description}</p>
        ) : null}
      </div>
      {href ? (
        <MedicalLink
          href={href}
          className="medi-focus group flex shrink-0 items-center gap-1.5 rounded text-[0.875rem] font-semibold text-medi-teal-700"
        >
          {linkLabel}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </MedicalLink>
      ) : null}
    </div>
  );
}
