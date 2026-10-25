import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { businessContact } from "@/lib/medical/contact";

export const metadata: Metadata = {
  title: "About",
  description:
    "Nickimart Medical supplies laboratory reagents, diagnostics, consumables and equipment to hospitals, laboratories and clinics in Ghana.",
};

/**
 * What this business is, said plainly.
 *
 * Every sentence here is either a fact about the company or a description of
 * how the system behind this site actually works. There are no quality claims,
 * no certifications, no customer counts and no delivery promises: those are
 * either the business's to publish or nobody's.
 */
export default async function AboutPage() {
  const contact = await businessContact();

  return (
    <ContentPage
      title="About Nickimart Medical"
      lede="The medical and laboratory supply arm of Nickimart, serving hospitals, laboratories, clinics and pharmacies in Ghana."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "About" }]}
      aside={
        <div className="medi-panel p-5">
          <h2 className="medi-h3 text-medi-ink">Talk to us</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="medi-meta text-medi-muted">Telephone</dt>
              <dd className="mt-0.5 text-sm text-medi-ink">
                <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="medi-focus rounded hover:underline">
                  {contact.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="medi-meta text-medi-muted">Email</dt>
              <dd className="mt-0.5 text-sm text-medi-ink">
                <a href={`mailto:${contact.email}`} className="medi-focus rounded hover:underline">
                  {contact.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="medi-meta text-medi-muted">Address</dt>
              <dd className="mt-0.5 text-sm text-medi-ink">{contact.address}</dd>
            </div>
          </dl>
          <MedicalButtonLink href="/medicals/quotations/new" className="mt-5 w-full">
            Request a quotation
          </MedicalButtonLink>
        </div>
      }
    >
      <ContentSection title="What we supply">
        <p>
          Reagents and diagnostics, laboratory and medical consumables, and
          equipment for hospitals, laboratories and clinics. The catalogue is
          organised by department rather than by brand, because that is how a
          laboratory orders: by the bench the thing is used on.
        </p>
        <p>
          Not everything we supply is in the catalogue. Specialist instruments
          and anything bought to order are sourced per request, and the
          quotation form takes a description of what you need as readily as a
          catalogue number.
        </p>
      </ContentSection>

      <ContentSection title="Two ways to buy">
        <p>
          Lines we hold in stock can be bought outright from the catalogue.
          Everything else — and anything an institution needs priced for a
          finance office — goes through a quotation. Each product says which of
          the two applies to it, and many allow both.
        </p>
      </ContentSection>

      <ContentSection title="Supplying institutions">
        <p>
          For hospitals, laboratories and government facilities we work the way
          procurement works: a written quotation, a purchase order raised
          against it, delivery against that order, and an invoice that
          references both. Tenders are handled the same way, per product rather
          than per tender — a single tender can be won in part.
        </p>
      </ContentSection>

      <ContentSection title="Prices and lead times">
        <p>
          Catalogue prices are per the unit stated on each product. A quotation
          is priced for the quantity you ask for and states how long it is valid
          for. Lead times are shown per product, because they depend on what the
          item is and where it comes from rather than on a single company-wide
          figure.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
