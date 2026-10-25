import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { businessContact } from "@/lib/medical/contact";

export const metadata: Metadata = {
  title: "Supply to us",
  description: "For manufacturers and distributors who want to supply Nickimart Medical.",
};

/**
 * The other side of the trade.
 *
 * Nothing here commits the business to anything — no terms, no volumes, no
 * promise to reply by a date. It says what to send so that somebody can
 * actually evaluate an offer, which is the whole use of the page.
 */
export default async function SuppliersPage() {
  const contact = await businessContact();

  return (
    <ContentPage
      title="Supply to us"
      lede="For manufacturers, importers and distributors of laboratory and medical products."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Supply to us" }]}
      aside={
        <div className="medi-panel p-5">
          <h2 className="medi-h3 text-medi-ink">Send it to</h2>
          <p className="mt-2 text-sm">
            <a
              href={`mailto:${contact.email}?subject=Supplier%20introduction`}
              className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
            >
              {contact.email}
            </a>
          </p>
          <p className="medi-meta mt-3 text-medi-muted">
            Mark it for purchasing. Attachments are fine.
          </p>
        </div>
      }
    >
      <ContentSection title="What to send">
        <p>
          A catalogue or line card, your price list with pack sizes and units,
          your lead times, and your minimum order quantity. For reagents and
          diagnostics, say which analysers they are for.
        </p>
        <p>
          Regulatory documentation for the products you are offering, where it
          applies to them, and the name of whoever we should talk to.
        </p>
      </ContentSection>

      <ContentSection title="How we buy">
        <p>
          We compare offers line by line rather than supplier by supplier, so a
          competitive price on two items is worth sending even if you cannot
          cover the rest of a list. Quoted prices, charges and lead times are
          recorded against the offer they came from.
        </p>
      </ContentSection>

      <ContentSection title="Existing suppliers">
        <p>
          Send price changes in writing before they take effect, with the
          catalogue numbers affected. Purchase orders we raise carry our own
          reference; quote it on your invoice and the two can be matched without
          anybody having to guess.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
