import { Suspense } from "react";
import { Banknote } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager, readPaging } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSupplierInvoices } from "@/lib/medical/procurement/queries";
import { discrepancyStatus, supplierInvoiceStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, sum, toPesewas } from "@/lib/medical/money";
import { formatDate, daysUntil } from "@/lib/medical/format";
import { StatusBadge } from "@/components/medical/console/StatusBadge";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function PayablesPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/payables");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listSupplierInvoices({
    q: one(query.q),
    status: one(query.status),
    discrepancy: one(query.discrepancy),
    skip,
    take: perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // Totals over the page in view, labelled as such — a figure that claims to
  // be the whole book while showing one page of it is a figure that misleads.
  const outstandingHere = sum(
    rows.map((invoice) =>
      Math.max(0, toPesewas(invoice.amountGhs) - toPesewas(invoice.amountPaid)),
    ),
  );
  const flagged = rows.filter((i) => i.discrepancyKind !== "NONE" && !i.isMatched).length;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Payables"
        subtitle="Supplier invoices, matched against what was ordered and what was accepted."
        icon={Banknote}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoices on this page" value={String(rows.length)} hint={`${total} in total`} />
        <StatCard label="Outstanding on this page" value={formatPesewas(outstandingHere)} />
        <StatCard
          label="With differences"
          value={String(flagged)}
          hint="Billed does not match ordered or accepted"
          tone={flagged > 0 ? "attention" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Our reference, theirs, or supplier" className="w-full sm:w-72" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="status" options={supplierInvoiceStatus.options} />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips
            name="discrepancy"
            allLabel="All invoices"
            options={[{ value: "1", label: "Unresolved differences" }]}
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Reference",
          "Supplier",
          "Their number",
          "Match",
          "Status",
          "Due",
          { label: "Amount", numeric: true },
          { label: "Outstanding", numeric: true },
        ]}
        empty={{
          title: "No supplier invoices",
          body: "Invoices recorded against purchase orders appear here, with what was billed set beside what was ordered and accepted.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((invoice) => {
          const outstanding = Math.max(
            0,
            toPesewas(invoice.amountGhs) - toPesewas(invoice.amountPaid),
          );
          const overdue =
            invoice.dueAt && outstanding > 0 && daysUntil(invoice.dueAt) < 0;
          return (
            <Row key={invoice.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/payables/${invoice.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {invoice.reference}
                </MedicalLink>
                {invoice.purchaseOrder ? (
                  <span className="medi-meta font-figures mt-0.5 block font-normal text-medi-muted">
                    {invoice.purchaseOrder.reference}
                  </span>
                ) : null}
              </td>
              <td className={td}>{invoice.supplier.name}</td>
              <td className={td}>
                <span className="font-figures">{invoice.supplierReference || "—"}</span>
              </td>
              <td className={td}>
                {invoice.isMatched && invoice.discrepancyKind !== "NONE" ? (
                  <StatusBadge label="Accepted" tone="warn" />
                ) : (
                  <discrepancyStatus.Badge status={invoice.discrepancyKind as never} />
                )}
              </td>
              <td className={td}>
                <supplierInvoiceStatus.Badge status={invoice.status as never} />
              </td>
              <td className={td}>
                {formatDate(invoice.dueAt)}
                {overdue ? (
                  <StatusBadge label="Overdue" tone="bad" className="ml-2 align-middle" />
                ) : null}
              </td>
              <td className={tdNum}>{formatPesewas(toPesewas(invoice.amountGhs))}</td>
              <td className={tdNum}>{formatPesewas(outstanding)}</td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
