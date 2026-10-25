import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { businessContact } from "@/lib/medical/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Nickimart Medical about a quotation, an order or a product.",
};

/**
 * How to reach a person.
 *
 * A telephone number and an email address rather than a form, deliberately.
 * A form that writes to a table nobody is watching is worse than no form: the
 * customer believes they have been heard. When the console grows a screen for
 * support requests this page can grow a form; until then it sends people
 * somewhere a human is.
 */
export default async function SupportPage() {
  const contact = await businessContact();
  const tel = contact.phone.replace(/\s/g, "");

  return (
    <ContentPage
      title="Contact us"
      lede="For a price, an order, a delivery or anything about a product."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Contact" }]}
      aside={
        <div className="medi-panel p-5">
          <ul className="space-y-4">
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-medi-teal-600" aria-hidden />
              <span>
                <span className="medi-meta block text-medi-muted">Telephone</span>
                <a href={`tel:${tel}`} className="medi-focus rounded text-sm font-semibold text-medi-ink hover:underline">
                  {contact.phone}
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-medi-teal-600" aria-hidden />
              <span>
                <span className="medi-meta block text-medi-muted">Email</span>
                <a href={`mailto:${contact.email}`} className="medi-focus rounded text-sm font-semibold text-medi-ink hover:underline">
                  {contact.email}
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-medi-teal-600" aria-hidden />
              <span>
                <span className="medi-meta block text-medi-muted">Address</span>
                <span className="text-sm font-semibold text-medi-ink">{contact.address}</span>
              </span>
            </li>
          </ul>
        </div>
      }
    >
      <ContentSection title="About a quotation you have asked for">
        <p>
          Quote the reference — it begins with <span className="font-figures">QR-</span> — and
          we can find it straight away. Requests you sent while signed in are
          listed in{" "}
          <MedicalLink href="/medicals/account" className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline">
            your account
          </MedicalLink>
          . If you sent it without an account, the link in your confirmation is
          the way back to it.
        </p>
      </ContentSection>

      <ContentSection title="About an order">
        <p>
          Quote the order reference, which begins with{" "}
          <span className="font-figures">SO-</span>, or the invoice number if you
          have been invoiced. You can also{" "}
          <MedicalLink href="/medicals/orders/track" className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline">
            look an order up
          </MedicalLink>{" "}
          with its reference.
        </p>
      </ContentSection>

      <ContentSection title="About a product">
        <p>
          Tell us the catalogue number and what it is for. For equipment it
          helps to say what it has to be compatible with; for reagents, which
          analyser and which pack size.
        </p>
      </ContentSection>

      <ContentSection title="Supplying us">
        <p>
          Manufacturers and distributors should write to the same address —{" "}
          <MedicalLink href="/medicals/suppliers" className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline">
            what to send is here
          </MedicalLink>
          .
        </p>
      </ContentSection>
    </ContentPage>
  );
}
