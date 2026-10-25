import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listQuotationRequests, quotationSummary } from "@/lib/medical/quotations/queries";
import { requestStatus, REQUEST_SOURCES } from "@/lib/medical/quotations/display";
import { daysUntil, formatDate, relativeDays } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * The queue: what customers have asked to be priced.
 *
 * A request is the question, and a quotation is one of the answers — kept as
 * separate records because one request can produce several versions of an
 * offer, and collapsing them would lose the question the moment somebody
 * answered it.
 *
 * Sorted newest first and filtered by status, because the only thing this
 * screen is for is deciding what to pick up next.
 */
export default async function QuotationRequestsPage({ searchParams }: { searchParams: Search }) {
  const me = await requireMedicalStaff("/medicals/admin/quotation-requests");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const mine = one(query.mine) === "1";

  const [{ rows, total }, summary] = await Promise.all([
    listQuotationRequests({
      q: one(query.q),
      status: one(query.status),
      assigneeId: mine ? me.staffId : undefined,
      skip,
      take: perPage,
    }),
    quotationSummary(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Quotation requests"
        subtitle="What customers have asked to be priced. A request is the question; a quotation is the answer."
        icon={Inbox}
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New, nobody looking"
          value={String(summary.newRequests)}
          tone={summary.newRequests > 0 ? "attention" : "default"}
          href="/medicals/admin/quotation-requests?status=NEW"
        />
        <StatCard label="Being priced" value={String(summary.drafting)} />
        <StatCard
          label="Out with customers"
          value={String(summary.awaitingCustomer)}
          hint="Issued, sent or read"
          href="/medicals/admin/quotations?status=SENT"
        />
        <StatCard
          label="Accepted, no order yet"
          value={String(summary.accepted)}
          tone={summary.accepted > 0 ? "attention" : "default"}
          href="/medicals/admin/quotations?status=ACCEPTED"
        />
      </div>

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Reference, contact, email or institution"
            className="w-full sm:w-96"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips name="status" options={requestStatus.options} />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips name="mine" allLabel="Anyone" options={[{ value: "1", label: "Mine" }]} />
          </Suspense>
        </div>
      </div>

      <ConsoleTable
        minWidth={980}
        columns={[
          "Reference",
          "Who asked",
          "Status",
          "Came from",
          "Needed by",
          { label: "Line items", numeric: true },
          { label: "Documents", numeric: true },
          "With",
        ]}
        empty={{
          title: "Nothing waiting to be priced",
          body: "A request arrives when a customer asks for a price on the storefront, or when somebody records one taken by telephone.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((request) => {
          const days = request.requiredBy ? daysUntil(request.requiredBy) : null;
          return (
            <Row key={request.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/quotation-requests/${request.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {request.reference}
                </MedicalLink>
                <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                  {formatDate(request.submittedAt)}
                </span>
              </td>
              <td className={td}>
                {request.organisation?.name ??
                  request.institutionName ??
                  request.customer?.name ??
                  request.contactName ??
                  "—"}
                {request.specialRequest ? (
                  <StatusBadge label="Off-catalogue" tone="info" className="ml-2" />
                ) : null}
              </td>
              <td className={td}>
                <requestStatus.Badge status={request.status as never} />
              </td>
              <td className={td}>
                <span className="medi-meta text-medi-muted">
                  {REQUEST_SOURCES[request.source] ?? request.source.toLowerCase()}
                </span>
              </td>
              <td className={td}>
                {request.requiredBy === null ? (
                  <span className="medi-meta text-medi-muted">Not stated</span>
                ) : days !== null && days < 0 ? (
                  <StatusBadge label="Passed" tone="bad" />
                ) : days !== null && days <= 7 ? (
                  <StatusBadge label={relativeDays(request.requiredBy)} tone="warn" />
                ) : (
                  formatDate(request.requiredBy)
                )}
              </td>
              <td className={tdNum}>{request._count.items}</td>
              <td className={tdNum}>
                {request._count.quotations === 0 ? (
                  <span className="text-medi-warning">0</span>
                ) : (
                  request._count.quotations
                )}
              </td>
              <td className={td}>
                {request.assignee?.name ?? (
                  <span className="medi-meta text-medi-warning">Nobody</span>
                )}
              </td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
