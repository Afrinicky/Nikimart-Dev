import { Suspense } from "react";
import { FileSignature } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { customerPoStatus } from "@/lib/medical/sales/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function CustomerPurchaseOrdersPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/customer-purchase-orders");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const q = one(query.q);
  const status = one(query.status);

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" as const } },
            { customerReference: { contains: q, mode: "insensitive" as const } },
            { organisation: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const { rows, total } = await readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.customerPurchaseOrder.findMany({
          where,
          select: {
            id: true,
            reference: true,
            customerReference: true,
            status: true,
            receivedAt: true,
            expectedDeliveryAt: true,
            totalValue: true,
            salesOrderId: true,
            organisation: { select: { name: true } },
            quotation: { select: { id: true, reference: true } },
            _count: { select: { items: true } },
          },
          orderBy: { receivedAt: "desc" },
          skip,
          take: perPage,
        }),
        medicalDb.customerPurchaseOrder.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Customer purchase orders"
        subtitle="Purchase orders issued to us by institutions. A separate record from the purchase orders we issue to our own suppliers: this one authorises us to supply."
        icon={FileSignature}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch
            placeholder="Reference, customer reference or institution"
            className="w-full sm:w-80"
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="status" options={customerPoStatus.options} />
        </Suspense>
      </div>

      <ConsoleTable
        minWidth={940}
        columns={[
          "Reference",
          "Customer reference",
          "Institution",
          "Status",
          "Received",
          { label: "Line items", numeric: true },
          { label: "Customer total", numeric: true },
          "Sales order",
        ]}
        empty={{
          title: "No customer purchase orders",
          body: "When an institution accepts a quotation and issues its purchase order, record it here. It is verified against the quotation before it becomes a sales order.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((po) => (
          <Row key={po.id}>
            <td className={tdKey}>
              <MedicalLink
                href={`/medicals/admin/customer-purchase-orders/${po.id}`}
                className="medi-focus font-figures rounded hover:text-medi-teal-700"
              >
                {po.reference}
              </MedicalLink>
            </td>
            <td className={td}>
              <span className="font-figures font-semibold text-medi-ink">
                {po.customerReference || "—"}
              </span>
            </td>
            <td className={td}>{po.organisation?.name ?? "—"}</td>
            <td className={td}>
              <customerPoStatus.Badge status={po.status as never} />
            </td>
            <td className={td}>{formatDate(po.receivedAt)}</td>
            <td className={tdNum}>{po._count.items}</td>
            <td className={tdNum}>{formatPesewas(toPesewas(po.totalValue))}</td>
            <td className={td}>
              {po.salesOrderId ? (
                <MedicalLink
                  href={`/medicals/admin/customer-orders/${po.salesOrderId}`}
                  className="medi-focus medi-meta rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  View sales order
                </MedicalLink>
              ) : (
                <span className="medi-meta text-medi-muted">Not yet accepted</span>
              )}
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}
