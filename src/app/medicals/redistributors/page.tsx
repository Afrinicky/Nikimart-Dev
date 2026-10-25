import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { businessContact } from "@/lib/medical/contact";

export const metadata: Metadata = {
  title: "Become a redistributor",
  description:
    "For sales representatives and agents who introduce laboratories and clinics to Nickimart Medical.",
};

/**
 * The referral arrangement, described without inventing its terms.
 *
 * Commission rates, thresholds and payout timing are commercial decisions the
 * business makes per agreement — they live in settings and in the agreement
 * itself, not in a marketing page. So this page says what the arrangement is
 * and how to ask about it, and states no number at all.
 */
export default async function RedistributorsPage() {
  const contact = await businessContact();

  return (
    <ContentPage
      title="Become a redistributor"
      lede="For representatives and agents who introduce laboratories, clinics and hospitals to us."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Redistributors" }]}
      aside={
        <div className="medi-panel p-5">
          <h2 className="medi-h3 text-medi-ink">Ask about it</h2>
          <p className="mt-2 text-sm">
            <a
              href={`mailto:${contact.email}?subject=Redistributor%20enquiry`}
              className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
            >
              {contact.email}
            </a>
          </p>
          <p className="mt-2 text-sm">
            <a
              href={`tel:${contact.phone.replace(/\s/g, "")}`}
              className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
            >
              {contact.phone}
            </a>
          </p>
        </div>
      }
    >
      <ContentSection title="What it is">
        <p>
          You introduce a facility to us; the sales that follow are attributed
          to you and earn commission. Attribution is recorded when the
          introduction is made and survives the weeks between a first quotation
          and a first order, which is usually where an informal arrangement
          falls apart.
        </p>
      </ContentSection>

      <ContentSection title="What you get">
        <p>
          A statement of what has been attributed to you, what it has earned,
          and what has been paid. Commission rates and payment terms are agreed
          with you in writing before anything starts — they are not the same for
          every arrangement, so this page does not quote one.
        </p>
      </ContentSection>

      <ContentSection title="Who it suits">
        <p>
          People already working with laboratories and clinics: equipment
          engineers, independent representatives, and distributors covering a
          region we do not reach often.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
