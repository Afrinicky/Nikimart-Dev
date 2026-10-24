import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSalesOrders } from "@/lib/medical/sales/queries";
import { fulfilmentStatus, paymentStatus } from "@/lib/medical/sales/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Sales orders: what we have committed to supply.
 *
 * Fulfilment and payment are separate columns because they are separate facts.
 * An order can be delivered and unpaid, or paid and awaiting picking, and a
 * single status column would force one of those to be a lie.
 */
export default async function CustomerOrdersPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/customer-orders");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listSalesOrders({
    q: one(query.q),
    fulfilment: one(query.fulfilment),
    payment: one(query.payment),
    skip,
    take: perPage,
  });

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Sales orders"
        subtitle="Confirmed commitments to supply. A sales order is a commitment — not a dispatch, and not a payment."
        icon={ClipboardList}
      />

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Reference, institution or customer purchase order"
            className="w-full sm:w-96"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Labelled label="Fulfilment">
            <Suspense fallback={null}>
              <FilterChips name="fulfilment" options={fulfilmentStatus.options} />
            </Suspense>
          </Labelled>
          <Labelled label="Payment">
            <Suspense fallback={null}>
              <FilterChips name="payment" options={paymentStatus.options} />
            </Suspense>
          </Labelled>
        </div>
      </div>

      <ConsoleTable
        minWidth={980}
        columns={[
          "Reference",
          "Customer",
          "Fulfilment",
          "Payment",
          "Order date",
          { label: "Line items", numeric: true },
          { label: "Total payable", numeric: true },
          { label: "Balance due", numeric: true },
          "Sourcing",
        ]}
        empty={{
          title: "No sales orders",
          body: "A sales order appears here when a customer purchase order is accepted, or when a storefront checkout completes.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((order) => {
          const outstanding = toPesewas(order.balanceDue);
          return (
            <Row key={order.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/customer-orders/${order.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {order.reference}
                </MedicalLink>
              </td>
              <td className={td}>
                {order.organisation?.name ??
                  order.customer?.name ??
                  order.walkInName ??
                  "—"}
              </td>
              <td className={td}>
                <fulfilmentStatus.Badge status={order.fulfilmentStatus as never} />
              </td>
              <td className={td}>
                <paymentStatus.Badge status={order.paymentStatus as never} />
              </td>
              <td className={td}>{formatDate(order.placedAt)}</td>
              <td className={tdNum}>{order._count.items}</td>
              <td className={tdNum}>{formatPesewas(toPesewas(order.totalPayable))}</td>
              <td className={tdNum}>
                {outstanding > 0 ? (
                  <span className="text-medi-warning">{formatPesewas(outstanding)}</span>
                ) : (
                  <span className="text-medi-muted">—</span>
                )}
              </td>
              <td className={td}>
                {order._count.sourcingRequests > 0 ? (
                  <StatusBadge
                    label={`${order._count.sourcingRequests} request${order._count.sourcingRequests === 1 ? "" : "s"}`}
                    tone="progress"
                  />
                ) : (
                  <span className="medi-meta text-medi-muted">None</span>
                )}
              </td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="medi-label text-medi-muted">{label}</span>
      {children}
    </div>
  );
}
