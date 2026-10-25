import { Suspense } from "react";
import { Search } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSourcingRequests } from "@/lib/medical/sales/queries";
import { sourcingStatus } from "@/lib/medical/procurement/status";
import { formatDate, relativeDays } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

const REASONS = [
  { value: "CUSTOMER_ORDER", label: "Sales order" },
  { value: "STOCK_REPLENISHMENT", label: "Stock replenishment" },
  { value: "TENDER", label: "Tender" },
  { value: "SAMPLE", label: "Sample" },
  { value: "QUOTATION", label: "Quotation pricing" },
];

const PRIORITY_TONE = {
  URGENT: "bad",
  HIGH: "warn",
  NORMAL: "neutral",
  LOW: "neutral",
} as const;

/**
 * The procurement queue.
 *
 * A sourcing request is a record of what has to be procured, not a message to
 * anybody. It is a record because the items that should be bought together are
 * not the items that were sold together: four customers short of the same
 * reagent is one supplier order, and consolidating them is only possible if
 * each shortfall is recorded where a buyer can see all of them at once.
 */
export default async function SourcingPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/sourcing");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listSourcingRequests({
    q: one(query.q),
    status: one(query.status),
    reason: one(query.reason),
    skip,
    take: perPage,
  });

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Sourcing requests"
        subtitle="What has to be procured, and why. Raising a request commits nothing — it is the record supplier prices are gathered against."
        icon={Search}
      />

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Reference, sales order or product"
            className="w-full sm:w-96"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips name="status" options={sourcingStatus.options} />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips name="reason" options={REASONS} allLabel="All reasons" />
          </Suspense>
        </div>
      </div>

      <ConsoleTable
        minWidth={940}
        columns={[
          "Reference",
          "Reason",
          "Status",
          "Priority",
          "Required by",
          { label: "Line items", numeric: true },
          { label: "Quotations", numeric: true },
          "Raised against",
        ]}
        empty={{
          title: "No sourcing requests",
          body: "A request appears here when an accepted sales order cannot be filled from stock, or when one is raised to replenish inventory.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((request) => (
          <Row key={request.id}>
            <td className={tdKey}>
              <MedicalLink
                href={`/medicals/admin/sourcing/${request.id}`}
                className="medi-focus font-figures rounded hover:text-medi-teal-700"
              >
                {request.reference}
              </MedicalLink>
            </td>
            <td className={td}>
              {REASONS.find((r) => r.value === request.reason)?.label ?? request.reason}
            </td>
            <td className={td}>
              <sourcingStatus.Badge status={request.status as never} />
            </td>
            <td className={td}>
              {request.priority === "NORMAL" || request.priority === "LOW" ? (
                <span className="medi-meta text-medi-muted">{request.priority.toLowerCase()}</span>
              ) : (
                <StatusBadge
                  label={request.priority.toLowerCase()}
                  tone={PRIORITY_TONE[request.priority as keyof typeof PRIORITY_TONE] ?? "neutral"}
                />
              )}
            </td>
            <td className={td}>
              {request.neededBy ? (
                <>
                  {formatDate(request.neededBy)}
                  <span className="medi-meta ml-1.5 text-medi-muted">
                    {relativeDays(request.neededBy)}
                  </span>
                </>
              ) : (
                <span className="medi-meta text-medi-muted">Not stated</span>
              )}
            </td>
            <td className={tdNum}>{request._count.items}</td>
            <td className={tdNum}>
              {request._count.supplierQuotes === 0 ? (
                <span className="text-medi-warning">0</span>
              ) : (
                request._count.supplierQuotes
              )}
            </td>
            <td className={td}>
              {request.salesOrder ? (
                <MedicalLink
                  href={`/medicals/admin/customer-orders/${request.salesOrder.id}`}
                  className="medi-focus font-figures medi-meta rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {request.salesOrder.reference}
                </MedicalLink>
              ) : request.tender ? (
                <MedicalLink
                  href={`/medicals/admin/tenders/${request.tender.id}`}
                  className="medi-focus font-figures medi-meta rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {request.tender.reference}
                </MedicalLink>
              ) : (
                <span className="medi-meta text-medi-muted">Stock replenishment</span>
              )}
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}
