import { Suspense } from "react";
import { FileText } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listQuotations } from "@/lib/medical/quotations/queries";
import { quotationStatus } from "@/lib/medical/quotations/display";
import { effectiveStatus, nextAction } from "@/lib/medical/quotations/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { daysUntil, formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Every quotation and proforma, with whose move it is.
 *
 * The "waiting on" column is the point of the list. A table of statuses tells
 * you what state things are in; the question somebody actually has is what to
 * do next, and `nextAction` answers it in the same words on every screen.
 *
 * A lapsed quotation is shown as lapsed even though nothing has swept the
 * database to say so: `effectiveStatus` works it out from the validity date, so
 * the screen never offers a price that is no longer on offer.
 */
export default async function QuotationsPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/quotations");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listQuotations({
    q: one(query.q),
    status: one(query.status),
    documentType: one(query.kind),
    skip,
    take: perPage,
  });

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Quotations"
        subtitle="What we have offered, and what it is waiting on. An issued document is read-only — a change is a new version."
        icon={FileText}
      />

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch placeholder="Reference or who it is addressed to" className="w-full sm:w-96" />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips name="status" options={quotationStatus.options} />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips
              name="kind"
              allLabel="Both kinds"
              options={[
                { value: "QUOTATION", label: "Quotations" },
                { value: "PROFORMA", label: "Proforma invoices" },
              ]}
            />
          </Suspense>
        </div>
      </div>

      <ConsoleTable
        minWidth={1020}
        columns={[
          "Reference",
          "Addressed to",
          "Status",
          "Waiting on",
          "Issued",
          "Valid until",
          { label: "Line items", numeric: true },
          { label: "Total", numeric: true },
        ]}
        empty={{
          title: "No quotations",
          body: "Open a request and draft one. Nothing is offered to a customer until somebody prices it and issues it.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((doc) => {
          const status = effectiveStatus({ status: doc.status, validUntil: doc.validUntil });
          const days = doc.validUntil ? daysUntil(doc.validUntil) : null;
          return (
            <Row key={doc.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/quotations/${doc.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {doc.reference} v{doc.version}
                </MedicalLink>
                {doc.documentType === "PROFORMA" ? (
                  <StatusBadge label="Proforma" tone="info" className="ml-2" />
                ) : null}
              </td>
              <td className={td}>{doc.organisation?.name || doc.billToName || "—"}</td>
              <td className={td}>
                <quotationStatus.Badge status={status as never} />
              </td>
              <td className={td}>
                <span className="medi-prose block max-w-[22ch]">{nextAction(status)}</span>
              </td>
              <td className={td}>{doc.issuedAt ? formatDate(doc.issuedAt) : "Not issued"}</td>
              <td className={td}>
                {doc.validUntil === null ? (
                  <span className="medi-meta text-medi-muted">—</span>
                ) : status === "EXPIRED" ? (
                  <StatusBadge label="Lapsed" tone="neutral" />
                ) : days !== null && days <= 7 ? (
                  <StatusBadge label={`${days} days left`} tone="warn" />
                ) : (
                  formatDate(doc.validUntil)
                )}
              </td>
              <td className={tdNum}>{doc._count.items}</td>
              <td className={tdNum}>{formatPesewas(toPesewas(doc.totalPayable))}</td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
