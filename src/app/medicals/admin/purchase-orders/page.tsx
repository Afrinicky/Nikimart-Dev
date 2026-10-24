import { Suspense } from "react";
import { Truck } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager, readPaging } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listPurchaseOrders } from "@/lib/medical/procurement/queries";
import { purchaseOrderStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate, daysUntil } from "@/lib/medical/format";
import { canSeeCost } from "@/lib/medical/roles";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireMedicalStaff("/medicals/admin/purchase-orders");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listPurchaseOrders({
    q: one(query.q),
    status: one(query.status),
    overdue: one(query.overdue),
    skip,
    take: perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const showMoney = canSeeCost(staff.role);

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Purchase orders"
        subtitle="What we have ordered from our own suppliers. Not the same thing as a purchase order a hospital sends us."
        icon={Truck}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Reference or supplier" className="w-full sm:w-72" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="status" options={purchaseOrderStatus.options} />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="overdue" allLabel="Any date" options={[{ value: "1", label: "Past due" }]} />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Reference",
          "Supplier",
          "Status",
          "Ordered",
          "Expected",
          { label: "Lines", numeric: true },
          { label: "Landed (GH₵)", numeric: true },
        ]}
        empty={{
          title: "No purchase orders",
          body: "Orders raised on suppliers appear here. Start one from a sourcing request so the lines come across by themselves.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((order) => {
          const late =
            order.expectedAt &&
            ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status) &&
            daysUntil(order.expectedAt) < 0;
          return (
            <Row key={order.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/purchase-orders/${order.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {order.reference}
                </MedicalLink>
              </td>
              <td className={td}>
                {order.supplier.name}
                <span className="medi-meta mt-0.5 block text-medi-muted">
                  {order.supplier.kind === "INTERNATIONAL" ? "International" : "Local"}
                </span>
              </td>
              <td className={td}>
                <purchaseOrderStatus.Badge status={order.status as never} />
              </td>
              <td className={td}>{formatDate(order.orderedAt)}</td>
              <td className={td}>
                {formatDate(order.expectedAt)}
                {late ? (
                  <StatusBadge label="Past due" tone="bad" className="ml-2 align-middle" />
                ) : null}
              </td>
              <td className={tdNum}>{order._count.items}</td>
              <td className={tdNum}>
                {showMoney ? (
                  <>
                    {formatPesewas(toPesewas(order.totalLandedGhs))}
                    {!order.costsConfirmed ? (
                      <span className="medi-meta ml-1.5 font-normal text-medi-muted">est.</span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
