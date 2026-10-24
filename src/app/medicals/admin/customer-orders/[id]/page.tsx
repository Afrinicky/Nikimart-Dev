import { notFound } from "next/navigation";
import { ClipboardList, Info } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { OpenSourcingForm } from "@/components/medical/console/SourcingForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getSalesOrder } from "@/lib/medical/sales/queries";
import { shortfallFor } from "@/lib/medical/sales/sourcing-actions";
import { fulfilmentStatus, paymentStatus } from "@/lib/medical/sales/status";
import { sourcingStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime } from "@/lib/medical/format";
import { canSeeCost } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

/**
 * A single sales order: what is owed to the customer, and what must be
 * procured to meet it.
 *
 * Reserved, dispatched and paid are three separate figures because they are
 * three separate events. Collapsing them into one status is what produces a
 * console that cannot answer "has it shipped and has it been paid" without
 * somebody telephoning the warehouse.
 */
export default async function CustomerOrderPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/customer-orders");
  const { id } = await params;

  const order = await getSalesOrder(id);
  if (!order) notFound();

  // Computed, never stored: free stock moves with every other order, so a
  // shortfall recorded yesterday is not the shortfall today.
  const shortfall = await shortfallFor(order.id);
  const showCost = canSeeCost(staff.role);

  const payable = toPesewas(order.totalPayable);
  const paid = toPesewas(order.amountPaid);
  const outstanding = toPesewas(order.balanceDue);
  const units = order.items.reduce((n, item) => n + item.quantity, 0);
  const dispatched = order.items.reduce((n, item) => n + item.quantityDispatched, 0);
  const reserved = order.items.reduce((n, item) => n + item.quantityReserved, 0);

  const customerName =
    order.organisation?.name ?? order.customer?.name ?? order.walkInName ?? "Walk-in";

  const openRounds = order.sourcingRequests.filter(
    (request) => request.status !== "FULFILLED" && request.status !== "CANCELLED",
  );

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={order.reference}
        subtitle={`${customerName} · ${CHANNELS[order.channel] ?? order.channel.toLowerCase()} · ordered ${formatDate(order.placedAt)}`}
        icon={ClipboardList}
        back={{ href: "/medicals/admin/customer-orders", label: "Sales orders" }}
      >
        <fulfilmentStatus.Badge status={order.fulfilmentStatus as never} className="self-center" />
        <paymentStatus.Badge status={order.paymentStatus as never} className="self-center" />
      </ConsoleHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total payable" value={formatPesewas(payable)} />
        <StatCard label="Payments received" value={formatPesewas(paid)} />
        <StatCard
          label="Balance due"
          value={formatPesewas(outstanding)}
          tone={outstanding > 0 ? "attention" : "default"}
        />
        <StatCard
          label="Units dispatched"
          value={`${dispatched} of ${units}`}
          hint={`${reserved} reserved in stock`}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="medi-panel p-5">
          <PanelHeading title="Source documents" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Customer purchase order">
              {order.customerPurchaseOrder ? (
                <MedicalLink
                  href={`/medicals/admin/customer-purchase-orders/${order.customerPurchaseOrder.id}`}
                  className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {order.customerPurchaseOrder.customerReference ||
                    order.customerPurchaseOrder.reference}
                </MedicalLink>
              ) : (
                "None recorded"
              )}
            </Detail>
            <Detail label="Quotation">
              {order.quotation ? (
                <span className="font-figures font-semibold">{order.quotation.reference}</span>
              ) : (
                "None"
              )}
            </Detail>
            <Detail label="Delivery method">
              {DELIVERY[order.deliveryMethod] ?? order.deliveryMethod}
            </Detail>
            {order.customerNote ? (
              <Detail label="Customer note">{order.customerNote}</Detail>
            ) : null}
            {order.internalNote ? (
              <Detail label="Internal note">{order.internalNote}</Detail>
            ) : null}
          </dl>
        </div>

        <div className="medi-panel p-5">
          <PanelHeading title="Progress" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Confirmed">
              {order.confirmedAt ? formatDateTime(order.confirmedAt) : "Not yet"}
            </Detail>
            <Detail label="Dispatched">
              {order.dispatchedAt ? formatDateTime(order.dispatchedAt) : "Not yet"}
            </Detail>
            <Detail label="Delivered">
              {order.deliveredAt ? formatDateTime(order.deliveredAt) : "Not yet"}
            </Detail>
            <Detail label="Payments recorded">{String(order.payments.length)}</Detail>
          </dl>
          <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
            <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <span>
              Dispatch and payment receipting are recorded against the delivery note and the
              payment record, not from this page. Revenue is recognised on delivery and at no
              earlier point.
            </span>
          </p>
        </div>
      </section>

      <section>
        <PanelHeading
          title="Line items"
          subtitle="Reserved is held in stock for this order. Dispatched has left the premises."
        />
        <ConsoleTable
          minWidth={showCost ? 980 : 860}
          columns={[
            "Description",
            { label: "Quantity ordered", numeric: true },
            { label: "Reserved", numeric: true },
            { label: "Dispatched", numeric: true },
            { label: "Unit price", numeric: true },
            { label: "Line total", numeric: true },
            ...(showCost ? [{ label: "Unit cost", numeric: true }] : []),
          ]}
          empty={{ title: "No line items", body: "This sales order has no line items." }}
        >
          {order.items.map((item) => (
            <Row key={item.id}>
              <td className={tdKey}>
                {item.description}
                {item.sku ? (
                  <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                    <span className="font-figures">{item.sku}</span>
                  </span>
                ) : null}
              </td>
              <td className={tdNum}>
                {item.quantity} {item.unit}
              </td>
              <td className={tdNum}>
                {item.quantityReserved < item.quantity - item.quantityDispatched ? (
                  <span className="text-medi-warning">{item.quantityReserved}</span>
                ) : (
                  item.quantityReserved
                )}
              </td>
              <td className={tdNum}>{item.quantityDispatched}</td>
              <td className={tdNum}>{formatPesewas(toPesewas(item.unitPrice))}</td>
              <td className={tdNum}>{formatPesewas(toPesewas(item.lineTotal))}</td>
              {showCost ? (
                <td className={tdNum}>
                  {toPesewas(item.unitCost) > 0 ? (
                    formatPesewas(toPesewas(item.unitCost))
                  ) : (
                    <span className="text-medi-muted">—</span>
                  )}
                </td>
              ) : null}
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {order.sourcingRequests.length > 0 ? (
        <section>
          <PanelHeading
            title="Sourcing requests"
            subtitle="What had to be procured for this order, and its current state."
          />
          <ConsoleTable
            minWidth={720}
            columns={[
              "Reference",
              "Status",
              "Priority",
              "Raised",
              { label: "Line items", numeric: true },
              { label: "Quotations", numeric: true },
            ]}
            empty={{
              title: "No sourcing requests",
              body: "Nothing had to be procured for this sales order.",
            }}
          >
            {order.sourcingRequests.map((request) => (
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
                  <sourcingStatus.Badge status={request.status as never} />
                </td>
                <td className={td}>{request.priority.toLowerCase()}</td>
                <td className={td}>{formatDate(request.createdAt)}</td>
                <td className={tdNum}>{request._count.items}</td>
                <td className={tdNum}>{request._count.supplierQuotes}</td>
              </Row>
            ))}
          </ConsoleTable>
        </section>
      ) : null}

      {order.payments.length > 0 ? (
        <section>
          <PanelHeading title="Payments" />
          <ConsoleTable
            minWidth={620}
            columns={[
              "Reference",
              "Method",
              "Status",
              "Date received",
              { label: "Amount", numeric: true },
            ]}
            empty={{
              title: "No payments",
              body: "Nothing has been received against this sales order.",
            }}
          >
            {order.payments.map((payment) => (
              <Row key={payment.id}>
                <td className={tdKey}>
                  <span className="font-figures">{payment.reference}</span>
                </td>
                <td className={td}>{payment.method.toLowerCase()}</td>
                <td className={td}>{payment.status.toLowerCase()}</td>
                <td className={td}>{payment.paidAt ? formatDate(payment.paidAt) : "—"}</td>
                <td className={tdNum}>{formatPesewas(toPesewas(payment.amount))}</td>
              </Row>
            ))}
          </ConsoleTable>
        </section>
      ) : null}

      {shortfall.length > 0 ? (
        <section>
          <PanelHeading
            title="Stock shortfall"
            subtitle={
              openRounds.length > 0
                ? "A sourcing request is already open. Raise another only for what it does not cover."
                : "What cannot be filled from stock. Raising a request records it for procurement."
            }
          />
          <div className="mt-4">
            <OpenSourcingForm
              salesOrderId={order.id}
              shortfall={shortfall.map((line) => ({
                description: line.description,
                ordered: line.ordered,
                available: line.available,
                short: line.short,
                unit: line.unit,
              }))}
            />
          </div>
        </section>
      ) : (
        <p className="medi-meta rounded-xl bg-medi-success-soft px-3.5 py-3 text-medi-success">
          Everything outstanding on this sales order can be filled from stock.
        </p>
      )}
    </div>
  );
}

const CHANNELS: Record<string, string> = {
  STOREFRONT: "storefront",
  QUOTATION: "converted from quotation",
  POS: "point of sale",
  PHONE: "telephone order",
};

const DELIVERY: Record<string, string> = {
  SELF_COLLECTION: "Customer collection",
  COURIER: "Courier",
  SUPPLIER_DIRECT: "Direct from supplier",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="medi-label text-medi-muted">{label}</dt>
      <dd className="text-right text-[0.8125rem] text-medi-ink">{children}</dd>
    </div>
  );
}
