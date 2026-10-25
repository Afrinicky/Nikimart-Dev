import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";

export const metadata: Metadata = {
  title: "How ordering works",
  description:
    "Buying outright, asking for a quotation, and how an institutional purchase order is handled.",
};

/**
 * What actually happens, step by step.
 *
 * Every statement on this page describes behaviour that exists in the system:
 * the two purchase modes, the request statuses, quotation versions and
 * validity, and how a customer's purchase order is recorded against a
 * quotation. Nothing here is a service promise.
 */
export default function HowOrderingWorksPage() {
  return (
    <ContentPage
      title="How ordering works"
      lede="Two routes, and the paperwork a hospital or a laboratory needs at the end of each."
      crumbs={[
        { href: "/medicals", label: "Home" },
        { label: "How ordering works" },
      ]}
      aside={
        <div className="medi-panel p-5">
          <h2 className="medi-h3 text-medi-ink">Start here</h2>
          <p className="medi-prose mt-2 text-[0.875rem] text-medi-body">
            Build a quotation list as you browse. Everything on it goes in one
            request.
          </p>
          <MedicalButtonLink href="/medicals/quotations/new" className="mt-4 w-full">
            Request a quotation
          </MedicalButtonLink>
          <MedicalButtonLink
            href="/medicals/categories"
            variant="secondary"
            className="mt-2.5 w-full"
          >
            Browse the catalogue
          </MedicalButtonLink>
        </div>
      }
    >
      <ContentSection title="Buying outright">
        <p>
          Products we hold can be added to the cart and bought at the listed
          price. Each product page says which unit the price is for and the
          smallest quantity we sell.
        </p>
        <p>
          Some products are marked as restricted. Those are sold to facilities
          rather than to individuals, and we confirm who you are before
          supplying them.
        </p>
      </ContentSection>

      <ContentSection title="Asking for a quotation">
        <p>
          Anything priced per order, anything bought to order, and anything a
          finance office has to approve goes through a quotation. Add products
          to your quotation list as you browse, then send them in one request —
          including anything you could not find, described in your own words.
        </p>
        <p>
          You do not need an account to ask. The confirmation gives you a link
          back to the request, which is also how you read the quotation when it
          is ready.
        </p>
      </ContentSection>

      <ContentSection title="What the status of a request means">
        <p>
          <strong className="font-semibold text-medi-ink">Received</strong> — it
          has arrived and is in the queue.{" "}
          <strong className="font-semibold text-medi-ink">Being reviewed</strong>{" "}
          and <strong className="font-semibold text-medi-ink">Being priced</strong>{" "}
          are the work of pricing it.{" "}
          <strong className="font-semibold text-medi-ink">
            Checking with suppliers
          </strong>{" "}
          means at least one line needs a price confirmed before we can quote
          it.{" "}
          <strong className="font-semibold text-medi-ink">Quotation sent</strong>{" "}
          means it is yours to review.
        </p>
      </ContentSection>

      <ContentSection title="Quotations">
        <p>
          A quotation states a price per line, the charges, and a date it is
          valid until. If something changes, we issue a new version rather than
          editing the one you are holding — so the document you were sent stays
          exactly as it was sent, and the version number tells you whether you
          are looking at the latest.
        </p>
      </ContentSection>

      <ContentSection title="Purchase orders from an institution">
        <p>
          When a quotation is accepted, your purchase order is recorded against
          it. The two are kept as separate documents with the link between them
          stated, which is what lets an auditor follow a delivery back to the
          price that was agreed.
        </p>
        <p>
          Part delivery is normal for an order with several lines, and each
          delivery references the order it belongs to.
        </p>
      </ContentSection>

      <ContentSection title="Tenders">
        <p>
          We respond per item rather than per tender: a tender with forty lines
          can be awarded to several suppliers, and the outcome is recorded line
          by line.{" "}
          <MedicalLink
            href="/medicals/support"
            className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
          >
            Send us the documents
          </MedicalLink>{" "}
          and we will tell you which lines we can bid.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
