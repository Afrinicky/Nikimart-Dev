import type { ReactNode } from "react";
import { ContentSection } from "@/components/medical/ui/ContentPage";

/**
 * A company policy, rendered in the medical surface.
 *
 * The text is the one the business publishes and edits in the retail console
 * (`/admin/legal`) — one company, one set of terms. Reprinting a second copy
 * here would guarantee that one of the two was out of date, and writing a
 * medical-specific policy from nothing would be inventing the company's legal
 * position.
 */
export function PolicySections({
  sections,
  updatedAt,
}: {
  sections: { heading: string; body: string }[];
  updatedAt: Date | null;
}): ReactNode {
  return (
    <>
      {sections.map((section, index) => (
        <ContentSection key={`${section.heading}-${index}`} title={section.heading}>
          {section.body.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </ContentSection>
      ))}

      {updatedAt ? (
        <p className="medi-meta border-t border-medi-rule pt-5 text-medi-muted">
          Last updated{" "}
          {updatedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </p>
      ) : null}
    </>
  );
}
