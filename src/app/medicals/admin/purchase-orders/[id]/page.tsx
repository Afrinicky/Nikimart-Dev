import { notFound } from "next/navigation";
import { CheckCircle2, Truck } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { GoodsReceiptForm } from "@/components/medical/console/GoodsReceiptForm";
import { LandedCostForm } from "@/components/medical/console/LandedCostForm";
import { ApproveOrderButton } from "@/components/medical/console/ApproveOrderButton";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getPurchaseOrder } from "@/lib/medical/procurement/queries";
import { purchaseOrderStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime } from "@/lib/medical/format";
import { canApproveSpending, canSeeCost } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

export default async function PurchaseOrderPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/purchase-orders");
  const { id } = await params;
  const order = await getPurchaseOrder(id);
  if (!order) notFound();

  const showMoney = canSeeCost(staff.role);
  const canApprove = canApproveSpending(staff.role);

  const acceptedTotal = order.items.reduce((n, item) => n + item.quantityReceived, 0);
  const orderedTotal = order.items.reduce((n, item) => n + item.quantity, 0);

  // Which customer orders this purchase is serving. The answer to "whose goods
  // are these" when the delivery arrives short.
  const servingSalesOrders = [
    ...new Set(
      order.items
        .map((item) => item.sourcingRequestItem?.sourcingRequest)
        .filter((request): request is NonNullable<typeof request> => Boolean(request))
        .map((request) => `${request.id}|${request.reference}|${request.salesOrderId ?? ""}`),
    ),
  ].map((entry) => {
    const [requestId, reference, salesOrderId] = entry.split("|");
    return { requestId, reference, salesOrderId };
  });

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={order.reference}
        subtitle={`${order.supplier.name} · ${order.supplier.kind === "INTERNATIONAL" ? "International" : "Local"} · ${order.currency}`}
        icon={Truck}
        back={{ href: "/medicals/admin/purchase-orders", label: "Purchase orders" }}
      >
        <purchaseOrderStatus.Badge status={order.status as never} className="self-center" />
        {order.status === "DRAFT" && canApprove ? <ApproveOrderButton purchaseOrderId={order.id} /> : null}
      </ConsoleHeader>

      {order.status === "DRAFT" ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
          <CheckCircle2 className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            This order is a draft. Nothing has been committed and nothing is on order until it is
            approved
            {canApprove ? "." : " by a manager or finance."}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lines" value={String(order.items.length)} />
        <StatCard
          label="Received"
          value={`${acceptedTotal} of ${orderedTotal}`}
          hint="Accepted units against ordered"
        />
        <StatCard label="Expected" value={formatDate(order.expectedAt)} />
        {showMoney ? (
          <StatCard
            label="Landed cost"
            value={formatPesewas(toPesewas(order.totalLandedGhs))}
            hint={order.costsConfirmed ? "Confirmed" : "Still estimated"}
            tone={order.costsConfirmed ? "default" : "attention"}
          />
        ) : null}
      </div>

      {servingSalesOrders.length > 0 ? (
        <section>
          <PanelHeading
            title="Bought for"
            subtitle="The customer orders waiting on this delivery."
          />
          <ul className="medi-panel mt-3 divide-y divide-medi-rule">
            {servingSalesOrders.map((entry) => (
              <li key={entry.requestId} className="flex items-center gap-3 px-5 py-3">
                <MedicalLink
                  href={`/medicals/admin/sourcing/${entry.requestId}`}
                  className="medi-focus font-figures rounded text-[0.8125rem] font-semibold text-medi-ink hover:text-medi-teal-700"
                >
                  {entry.reference}
                </MedicalLink>
                {entry.salesOrderId ? (
                  <MedicalLink
                    href={`/medicals/admin/customer-orders/${entry.salesOrderId}`}
                    className="medi-focus medi-meta rounded text-medi-teal-700 hover:underline"
                  >
                    View the customer order
                  </MedicalLink>
                ) : (
                  <span className="medi-meta text-medi-muted">Stock replenishment</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <PanelHeading title="Lines" />
        <ConsoleTable
          minWidth={880}
          columns={[
            "Description",
            { label: "Ordered", numeric: true },
            { label: "Accepted", numeric: true },
            ...(showMoney
              ? [
                  { label: "Unit cost", numeric: true },
                  { label: "Line total", numeric: true },
                  { label: "Landed/unit", numeric: true },
                ]
              : []),
          ]}
          empty={{ title: "No lines", body: "Add what is being bought." }}
        >
          {order.items.map((item) => (
            <Row key={item.id}>
              <td className={tdKey}>
                {item.description}
                {item.product ? (
                  <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                    <span className="font-figures">{item.product.sku}</span>
                  </span>
                ) : null}
              </td>
              <td className={tdNum}>{item.quantity}</td>
              <td className={tdNum}>
                {item.quantityReceived}
                {item.quantityReceived < item.quantity && order.status !== "DRAFT" ? (
                  <span className="medi-meta ml-1.5 font-normal text-medi-warning">
                    −{item.quantity - item.quantityReceived}
                  </span>
                ) : null}
              </td>
              {showMoney ? (
                <>
                  <td className={tdNum}>{formatPesewas(toPesewas(item.unitCost))}</td>
                  <td className={tdNum}>{formatPesewas(toPesewas(item.lineTotal))}</td>
                  <td className={tdNum}>
                    {toPesewas(item.landedUnitCostGhs) > 0
                      ? formatPesewas(toPesewas(item.landedUnitCostGhs))
                      : "—"}
                  </td>
                </>
              ) : null}
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {order.status !== "DRAFT" && order.status !== "CANCELLED" ? (
        <section>
          <PanelHeading
            title="Record a delivery"
            subtitle="Part deliveries are normal. Record what actually arrived."
          />
          <div className="mt-4">
            <GoodsReceiptForm
              purchaseOrderId={order.id}
              lines={order.items.map((item) => ({
                id: item.id,
                description: item.description,
                ordered: item.quantity,
                alreadyAccepted: item.quantityReceived,
                tracksBatches: Boolean(item.productId),
                unit: item.product?.unitOfSale ?? "unit",
              }))}
            />
          </div>
        </section>
      ) : null}

      {order.receipts.length > 0 ? (
        <section>
          <PanelHeading title="Deliveries" />
          <ConsoleTable
            minWidth={720}
            columns={[
              "Reference",
              "Received",
              "Delivery note",
              { label: "Accepted", numeric: true },
              { label: "Rejected", numeric: true },
            ]}
            empty={{ title: "Nothing received", body: "No deliveries recorded yet." }}
          >
            {order.receipts.map((receipt) => {
              const accepted = receipt.items.reduce((n, i) => n + i.quantityAccepted, 0);
              const rejected = receipt.items.reduce((n, i) => n + i.quantityRejected, 0);
              return (
                <Row key={receipt.id}>
                  <td className={tdKey}>
                    <span className="font-figures">{receipt.reference}</span>
                  </td>
                  <td className={td}>{formatDateTime(receipt.receivedAt)}</td>
                  <td className={td}>
                    <span className="font-figures">{receipt.deliveryNote || "—"}</span>
                  </td>
                  <td className={tdNum}>{accepted}</td>
                  <td className={tdNum}>
                    {rejected > 0 ? (
                      <StatusBadge label={String(rejected)} tone="bad" />
                    ) : (
                      <span className="text-medi-muted">0</span>
                    )}
                  </td>
                </Row>
              );
            })}
          </ConsoleTable>
        </section>
      ) : null}

      {showMoney ? (
        <section>
          <PanelHeading
            title="Landed costs"
            subtitle="What the goods cost by the time they are on the shelf. Estimates stand in until the actuals are known, and reports say which is which."
          />
          <div className="mt-4">
            <LandedCostForm order={order} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
