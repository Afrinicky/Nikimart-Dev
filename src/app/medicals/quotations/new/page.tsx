import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { RequestForm } from "@/components/medical/quotations/RequestForm";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";
import { isMedicalConfigured, medicalDb } from "@/lib/medical/db";
import { medicalCustomer } from "@/lib/medical/customer";

export const metadata: Metadata = {
  title: "Request a quotation",
  description:
    "Send a priced request for laboratory and medical supplies, including items that are not in the catalogue.",
};

/**
 * The form a request arrives through — and, today, the only way one does.
 *
 * Signed in, the fields that are already known are filled in; signed out, the
 * form is the same form. That is the point: the quotation flow is open, and
 * asking somebody to make an account before they can ask a question is how a
 * supplier loses the question.
 */
export default async function NewQuotationRequestPage() {
  if (!isMedicalConfigured()) return <NotConfigured />;

  // Read-only: opening the form must not create a customer record for somebody
  // who is only looking.
  const customer = await medicalCustomer();
  const organisation = customer?.organisationId
    ? await medicalDb.organisation
        .findUnique({ where: { id: customer.organisationId }, select: { name: true } })
        .catch(() => null)
    : null;

  return (
    <div className="mx-auto max-w-[52rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[{ href: "/medicals", label: "Home" }, { label: "Request a quotation" }]}
      />

      <header className="mt-6">
        <h1 className="medi-h1 text-medi-ink">Request a quotation</h1>
        <p className="medi-lede mt-2.5 text-medi-body">
          Tell us what you need and we will come back with a priced quotation you
          can take to your finance office. No account needed.
        </p>
      </header>

      <RequestForm
        defaults={{
          contactName: customer?.name ?? "",
          contactEmail: customer?.email ?? "",
          contactPhone: customer?.phone ?? "",
          institutionName: organisation?.name ?? "",
          institutionType:
            customer && customer.customerType !== "INDIVIDUAL" ? customer.customerType : "",
        }}
      />
    </div>
  );
}
