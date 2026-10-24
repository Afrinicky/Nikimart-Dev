import { Suspense } from "react";
import { ReceiptText } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSupplierQuotes } from "@/lib/medical/sales/queries";
import { supplierQuoteStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, toBasisPoints, toPesewas } from "@/lib/medical/money";
import { landedCostOf } from "@/lib/medical/procurement/landed-cost";
import { daysUntil, formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Supplier quotations: prices our own suppliers have offered us.
 *
 * Distinct from the quotations we issue to customers. Those are prices we are
 * offering; these are prices we have been offered. They are separate sections
 * because confusing the two is how a supplier's cost reaches a customer's
 * document.
 *
 * "Lands at" is the whole acquisition cost in GH₵ — goods converted at the
 * rate recorded with the quote, plus freight, duty on the CIF value and
 * clearing. It is computed by the same module the sourcing comparison uses, so
 * a figure here and the same figure there cannot drift apart. An import quoted
 * with no charges stated is flagged rather than ranked as though freight were
 * free.
 */
export default async function SupplierQuotesPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/supplier-quotes");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listSupplierQuotes({
    q: one(query.q),
    status: one(query.status),
    skip,
    take: perPage,
  });

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // Costed through the same module the sourcing comparison uses, so a figure
  // on this list and the same figure on that screen cannot drift apart.
  const costed = rows.map((quote) => {
    const cost = landedCostOf({
      id: quote.id,
      supplierId: quote.supplier.id,
      supplierName: quote.supplier.name,
      currency: quote.currency,
      exchangeRate: toBasisPoints(quote.exchangeRate),
      lines: quote.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: toPesewas(item.unitCost),
      })),
      freight: toPesewas(quote.freight),
      insurance: toPesewas(quote.insurance),
      otherSupplierCharges: toPesewas(quote.otherCharges),
      dutyRate: quote.dutyRateBp,
      clearingGhs: toPesewas(quote.clearingGhs),
      otherGhs: toPesewas(quote.otherGhs),
      leadTimeDays: Math.max(0, ...quote.items.map((item) => item.leadTimeDays), 0),
      costsConfirmed: quote.status === "RECEIVED",
    });
    // An import priced with nothing between their gate and ours is not a
    // landed cost, it is a goods value. Saying so is the difference between a
    // comparison and a guess.
    const chargesStated =
      cost.freightGhs + cost.dutyGhs + cost.clearingGhs + cost.otherGhs > 0;
    return {
      ...quote,
      cost,
      chargesMissing:
        quote.supplier.kind === "INTERNATIONAL" && cost.goodsGhs > 0 && !chargesStated,
    };
  });

  const awaiting = costed.filter((quote) => quote.status === "REQUESTED").length;
  const expiringSoon = costed.filter(
    (quote) =>
      quote.status === "RECEIVED" &&
      quote.validUntil !== null &&
      daysUntil(quote.validUntil) >= 0 &&
      daysUntil(quote.validUntil) <= 14,
  ).length;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Supplier quotations"
        subtitle="Prices offered to us by suppliers. Compared on landed cost within the sourcing request they belong to."
        icon={ReceiptText}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Shown on this page"
          value={String(costed.length)}
          hint={`${total} in total`}
        />
        <StatCard
          label="Awaiting quotation"
          value={String(awaiting)}
          tone={awaiting > 0 ? "attention" : "default"}
          hint="Invited, not yet priced"
        />
        <StatCard
          label="Expiring within 14 days"
          value={String(expiringSoon)}
          tone={expiringSoon > 0 ? "attention" : "default"}
          hint="A quoted price holds only until its validity lapses"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Reference, supplier or sourcing request"
            className="w-full sm:w-96"
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="status" options={supplierQuoteStatus.options} />
        </Suspense>
      </div>

      <ConsoleTable
        minWidth={1000}
        columns={[
          "Reference",
          "Supplier",
          "Status",
          "Sourcing request",
          "Requested",
          "Valid until",
          { label: "Line items", numeric: true },
          { label: "Landed cost", numeric: true },
          { label: "Lead time", numeric: true },
        ]}
        empty={{
          title: "No supplier quotations",
          body: "Raise a sourcing request and invite a supplier to quote. A quotation gathered against a request can be compared with the other quotations for it, which is the only comparison worth making.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {costed.map((quote) => {
          const days = quote.validUntil ? daysUntil(quote.validUntil) : null;
          return (
            <Row key={quote.id}>
              <td className={tdKey}>
                {quote.sourcingRequest ? (
                  <MedicalLink
                    href={`/medicals/admin/sourcing/${quote.sourcingRequest.id}`}
                    className="medi-focus font-figures rounded hover:text-medi-teal-700"
                  >
                    {quote.reference}
                  </MedicalLink>
                ) : (
                  <span className="font-figures">{quote.reference}</span>
                )}
              </td>
              <td className={td}>
                <MedicalLink
                  href={`/medicals/admin/suppliers/${quote.supplier.id}`}
                  className="medi-focus rounded hover:text-medi-teal-700"
                >
                  {quote.supplier.name}
                </MedicalLink>
                {quote.supplier.kind === "INTERNATIONAL" ? (
                  <span className="medi-meta ml-1.5 text-medi-muted">import</span>
                ) : null}
              </td>
              <td className={td}>
                <supplierQuoteStatus.Badge status={quote.status as never} />
              </td>
              <td className={td}>
                {quote.sourcingRequest ? (
                  <span className="font-figures medi-meta text-medi-muted">
                    {quote.sourcingRequest.reference}
                  </span>
                ) : (
                  <span className="medi-meta text-medi-muted">None</span>
                )}
              </td>
              <td className={td}>{formatDate(quote.requestedAt)}</td>
              <td className={td}>
                {quote.validUntil === null ? (
                  <span className="medi-meta text-medi-muted">Not stated</span>
                ) : days !== null && days < 0 ? (
                  <StatusBadge label="Lapsed" tone="neutral" />
                ) : days !== null && days <= 14 ? (
                  <StatusBadge label={`${days} days left`} tone="warn" />
                ) : (
                  formatDate(quote.validUntil)
                )}
              </td>
              <td className={tdNum}>{quote.items.length}</td>
              <td className={tdNum}>
                {quote.cost.totalGhs > 0 ? (
                  <>
                    {formatPesewas(quote.cost.totalGhs)}
                    {quote.currency !== "GHS" ? (
                      <span className="medi-meta ml-1 text-medi-muted">
                        quoted in {quote.currency}
                      </span>
                    ) : null}
                    {quote.chargesMissing ? (
                      <span className="medi-meta mt-0.5 block font-normal text-medi-warning">
                        Goods only — freight and duty not stated
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-medi-muted">Not priced</span>
                )}
              </td>
              <td className={tdNum}>
                {quote.cost.leadTimeDays > 0 ? `${quote.cost.leadTimeDays} days` : "—"}
              </td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
