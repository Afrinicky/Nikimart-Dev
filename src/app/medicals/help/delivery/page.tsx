import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";

export const metadata: Metadata = {
  title: "Delivery and lead times",
  description: "How lead times are stated, how cold-chain items travel, and how delivery is charged.",
};

/**
 * Lead times, honestly.
 *
 * No figure on this page is a promise, because no figure on this page is
 * company-wide: a lead time belongs to a product and a delivery charge belongs
 * to a quotation. Saying "next-day delivery in Accra" here would be inventing
 * a service level on behalf of the business.
 */
export default function DeliveryPage() {
  return (
    <ContentPage
      title="Delivery and lead times"
      lede="What is stated where, and what decides it."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Delivery" }]}
    >
      <ContentSection title="Lead times are per product">
        <p>
          Each product carries its own lead time, shown on its page and in your
          cart. A line we hold in Accra and a line brought in to order do not
          take the same time, and a single site-wide figure would be wrong for
          one of them.
        </p>
        <p>
          Where a product is out of stock, the page says so rather than letting
          you order it and finding out afterwards.
        </p>
      </ContentSection>

      <ContentSection title="Delivery on a quotation">
        <p>
          A quotation states the delivery charge for what is on it, for the
          place you asked it to be delivered. It is quoted rather than
          calculated from a table, because the cost of getting a crate of
          glassware to a district hospital is not the cost of getting a box of
          test strips across Accra.
        </p>
      </ContentSection>

      <ContentSection title="Cold chain">
        <p>
          Products that have to travel cold are marked on the catalogue, on the
          product page and in your cart. They are packed and routed for it,
          which affects both the cost and when we can send them.
        </p>
      </ContentSection>

      <ContentSection title="Part delivery">
        <p>
          An order with several lines may be delivered in parts, with each
          delivery referencing the order it belongs to. Your account shows what
          has been dispatched and what has not.
        </p>
      </ContentSection>

      <ContentSection title="Dangerous goods">
        <p>
          Some reagents are carried under dangerous-goods rules. Where that
          applies it is stated on the product, and it can restrict where and how
          quickly we can send them.{" "}
          <MedicalLink
            href="/medicals/support"
            className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
          >
            Ask us
          </MedicalLink>{" "}
          before ordering if the destination is outside Accra.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
