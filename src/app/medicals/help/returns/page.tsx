import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { PolicySections } from "@/components/medical/ui/PolicyBody";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { getPolicy } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Returns",
  description: "Nickimart's returns policy, and what it means for laboratory and medical supplies.",
};

/**
 * The company's returns policy, plus the part that is specific to this trade.
 *
 * The policy itself is the one the business publishes and edits; it is not
 * rewritten here. What is added is a note about cold chain and sterile
 * packaging, which is a fact about the goods rather than a change to the
 * policy — and it tells somebody to ask before sending anything back, which is
 * the outcome that actually helps them.
 */
export default async function ReturnsPage() {
  const policy = await getPolicy("returns");

  return (
    <ContentPage
      title={policy?.title ?? "Returns"}
      lede={policy?.intro}
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Returns" }]}
    >
      <ContentSection title="Before you send anything back">
        <p>
          Tell us first, quoting the order reference.{" "}
          <MedicalLink
            href="/medicals/support"
            className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
          >
            Contact us
          </MedicalLink>{" "}
          and we will say what to do with the goods. Cold-chain items that have
          left our control, and sterile packs whose packaging has been opened,
          cannot be put back into stock — so a return on those is a conversation
          rather than a form.
        </p>
      </ContentSection>

      {policy ? (
        <PolicySections sections={policy.sections} updatedAt={policy.updatedAt} />
      ) : null}
    </ContentPage>
  );
}
