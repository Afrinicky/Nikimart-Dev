import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { StatusChip } from "@/components/medical/ui/StatusChip";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";
import { isMedicalConfigured } from "@/lib/medical/db";
import { getRequestByToken, type PublicQuotation } from "@/lib/medical/quotations/public-queries";
import { QUOTATION_LABELS, REQUEST_LABELS } from "@/lib/medical/account/status-labels";
import { formatPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";

export const metadata: Metadata = {
  title: "Your quotation request",
  // A page whose address is its own authorisation must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

type Params = Promise<{ token: string }>;
type Search = Promise<{ sent?: string }>;

/**
 * A request, and whatever it has become.
 *
 * Reached by the link in the confirmation rather than by signing in, because
 * the person who asks for a quotation and the person who approves it are often
 * not the same person, and the second one has no account. The token in the
 * address is the authorisation — which is why this page is never indexed and
 * why `public-queries.ts` decides what crosses, not this component.
 */
export default async function QuotationRequestPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const { token } = await params;
  const { sent } = await searchParams;
  const request = await getRequestByToken(token);
  if (!request) notFound();

  const status = REQUEST_LABELS[request.status as keyof typeof REQUEST_LABELS];

  return (
    <div className="mx-auto max-w-[56rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[{ href: "/medicals", label: "Home" }, { label: request.reference }]}
      />

      {sent ? (
        <p className="medi-panel mt-6 flex items-start gap-3 bg-medi-success-soft p-4 text-[0.9375rem] text-medi-ink shadow-none">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-medi-success" aria-hidden />
          <span>
            Sent. Keep this page — the address is your link back to it, and it is
            how you will read the quotation when it is ready.
          </span>
        </p>
      ) : null}

      <header className="mt-6">
        <p className="medi-label text-medi-muted">Quotation request</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="medi-h1 font-figures text-medi-ink">{request.reference}</h1>
          <StatusChip entry={status} />
        </div>
        <p className="medi-lede mt-2.5 text-medi-body">
          Sent {formatDate(request.submittedAt)}
          {request.institutionName ? ` for ${request.institutionName}` : ""}.
          {status?.note ? ` ${status.note}` : ""}
        </p>
      </header>

      <section aria-labelledby="asked-for" className="mt-9">
        <h2 id="asked-for" className="medi-h3 text-medi-ink">
          What you asked for
        </h2>

        <div className="medi-panel mt-3 overflow-hidden">
          {request.lines.length === 0 ? (
            <p className="px-4 py-5 text-[0.9375rem] text-medi-body">
              No catalogue lines — see the description below.
            </p>
          ) : (
            <ul className="divide-y divide-medi-rule">
              {request.lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-medi-ink">
                      {line.productSlug ? (
                        <MedicalLink
                          href={`/medicals/products/${line.productSlug}`}
                          className="medi-focus rounded hover:text-medi-teal-700 hover:underline"
                        >
                          {line.description}
                        </MedicalLink>
                      ) : (
                        line.description
                      )}
                    </span>
                    {line.catalogueNumber ? (
                      <span className="medi-meta font-figures mt-0.5 block text-medi-muted">
                        {line.catalogueNumber}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-figures text-sm text-medi-body">
                    {line.quantity} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {request.specialRequest || request.notes || request.deliverTo || request.requiredBy ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {request.specialRequest ? (
              <Detail term="Also asked for" value={request.specialRequest} wide />
            ) : null}
            {request.notes ? <Detail term="Your notes" value={request.notes} wide /> : null}
            {request.deliverTo ? <Detail term="Deliver to" value={request.deliverTo} /> : null}
            {request.requiredBy ? (
              <Detail term="Needed by" value={formatDate(request.requiredBy)} />
            ) : null}
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="quotations" className="mt-10">
        <h2 id="quotations" className="medi-h3 text-medi-ink">
          {request.quotations.length > 1 ? "Quotations" : "Your quotation"}
        </h2>

        {request.quotations.length === 0 ? (
          <div className="medi-panel mt-3 px-4 py-6">
            <p className="medi-prose text-medi-body">
              Not priced yet. We will email the address on this request when the
              quotation is ready, and it will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-6">
            {request.quotations.map((quotation) => (
              <QuotationCard key={quotation.id} quotation={quotation} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <MedicalButtonLink href="/medicals/categories" variant="secondary">
          Back to the catalogue
        </MedicalButtonLink>
        <MedicalButtonLink href="/medicals/support" variant="ghost">
          Ask about this request
        </MedicalButtonLink>
      </div>
    </div>
  );
}

function QuotationCard({ quotation }: { quotation: PublicQuotation }) {
  const charges = [
    { label: "Subtotal", value: quotation.subtotal },
    { label: "Discount", value: -quotation.discountAmount },
    { label: "Delivery", value: quotation.deliveryCharge },
    { label: "Handling", value: quotation.handlingCharge },
    { label: "Other", value: quotation.otherCharge },
    { label: "VAT and levies", value: quotation.taxAmount },
  ].filter((row) => row.value !== 0);

  return (
    <article className="medi-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-medi-rule px-4 py-3.5">
        <h3 className="font-figures text-sm font-semibold text-medi-ink">
          {quotation.reference}
          {quotation.version > 1 ? ` v${quotation.version}` : ""}
        </h3>
        <StatusChip entry={QUOTATION_LABELS[quotation.status as keyof typeof QUOTATION_LABELS]} />
        <span className="medi-meta ml-auto text-medi-muted">
          {quotation.issuedAt ? `Issued ${formatDate(quotation.issuedAt)}` : null}
          {quotation.validUntil ? ` · valid until ${formatDate(quotation.validUntil)}` : null}
        </span>
      </header>

      <ul className="divide-y divide-medi-rule">
        {quotation.lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-medi-ink">{line.description}</span>
              {line.detail ? (
                <span className="medi-meta mt-0.5 block text-medi-muted">{line.detail}</span>
              ) : null}
            </span>
            <span className="font-figures medi-meta text-medi-muted">
              {line.quantity} {line.unit} × {formatPesewas(line.unitPrice)}
            </span>
            <span className="font-figures w-28 text-right text-sm font-semibold text-medi-ink">
              {formatPesewas(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-medi-rule bg-medi-surface px-4 py-3.5">
        <dl className="ml-auto max-w-xs space-y-1.5">
          {charges.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="medi-meta text-medi-muted">{row.label}</dt>
              <dd className="font-figures medi-meta text-medi-body">{formatPesewas(row.value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-medi-rule pt-2">
            <dt className="text-sm font-semibold text-medi-ink">Total</dt>
            <dd className="font-figures text-sm font-bold text-medi-ink">
              {formatPesewas(quotation.total)}
            </dd>
          </div>
        </dl>
      </div>

      {quotation.paymentTerms || quotation.deliveryEstimate || quotation.notes ? (
        <div className="space-y-1.5 border-t border-medi-rule px-4 py-3.5">
          {quotation.paymentTerms ? (
            <p className="medi-meta text-medi-body">
              <span className="font-semibold text-medi-ink">Payment:</span>{" "}
              {quotation.paymentTerms}
            </p>
          ) : null}
          {quotation.deliveryEstimate ? (
            <p className="medi-meta text-medi-body">
              <span className="font-semibold text-medi-ink">Delivery:</span>{" "}
              {quotation.deliveryEstimate}
            </p>
          ) : null}
          {quotation.notes ? <p className="medi-meta text-medi-body">{quotation.notes}</p> : null}
        </div>
      ) : null}

      {quotation.termsAndConditions ? (
        <p className="medi-meta border-t border-medi-rule px-4 py-3 text-medi-muted">
          {quotation.termsAndConditions}
        </p>
      ) : null}
    </article>
  );
}

function Detail({ term, value, wide }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="medi-meta text-medi-muted">{term}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-[0.9375rem] text-medi-ink">{value}</dd>
    </div>
  );
}
