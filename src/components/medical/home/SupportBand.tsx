import { Mail, Phone, Truck, Warehouse } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";

/**
 * The two conversations that are not an order: somebody who wants to sell to
 * us, and somebody who needs help with something they already bought.
 *
 * Two plain columns divided by a rule. Not four bordered boxes with icons at
 * the top, which is what this section is in every template and which says
 * nothing that the words do not.
 */
export function SupportBand() {
  return (
    <section className="grid gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
      <div>
        <h2 className="medi-h3 flex items-center gap-2.5">
          <Warehouse className="h-[1.125rem] w-[1.125rem] text-medi-teal-600" aria-hidden />
          Supplying to Nickimart Medical
        </h2>
        <p className="medi-prose mt-2.5 text-[0.875rem] text-medi-body">
          We buy locally and import. If you manufacture or distribute laboratory
          reagents, diagnostics, consumables or equipment, send us your catalogue
          and your terms — we will tell you honestly whether there is a fit.
        </p>
        <MedicalLink
          href="/medicals/suppliers"
          className="medi-focus mt-4 inline-block rounded text-[0.875rem] font-semibold text-medi-teal-700 underline-offset-4 hover:underline"
        >
          Register as a supplier
        </MedicalLink>
      </div>

      <div className="lg:border-l lg:border-medi-rule lg:pl-16">
        <h2 className="medi-h3 flex items-center gap-2.5">
          <Truck className="h-[1.125rem] w-[1.125rem] text-medi-teal-600" aria-hidden />
          Help with an order
        </h2>
        <p className="medi-prose mt-2.5 text-[0.875rem] text-medi-body">
          Lead times, cold-chain handling, a delivery that has not arrived, or a
          quotation you need reissued to a different department. Call during
          working hours or write any time.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <a
            href="tel:+233200000000"
            className="medi-focus flex items-center gap-2 rounded text-[0.875rem] font-semibold text-medi-ink hover:text-medi-teal-700"
          >
            <Phone className="h-4 w-4 text-medi-teal-600" aria-hidden />
            <span className="font-figures">+233 20 000 0000</span>
          </a>
          <a
            href="mailto:medical@nickimart.com"
            className="medi-focus flex items-center gap-2 rounded text-[0.875rem] font-semibold text-medi-ink hover:text-medi-teal-700"
          >
            <Mail className="h-4 w-4 text-medi-teal-600" aria-hidden />
            medical@nickimart.com
          </a>
        </div>
      </div>
    </section>
  );
}
