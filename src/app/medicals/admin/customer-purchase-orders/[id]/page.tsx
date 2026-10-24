import { notFound } from "next/navigation";
import { AlertTriangle, FileSignature } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import {
  AcceptCustomerPoForm,
  RejectCustomerPoForm,
} from "@/components/medical/console/CustomerPoForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb } from "@/lib/medical/db";
import { customerPoStatus } from "@/lib/medical/sales/status";
import { formatPesewas, sum, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime } from "@/lib/medical/format";

type Params = Promise<{ id: string }>;

/**
 * A single purchase order issued to us by an institution.
 *
 * The screen where "received" becomes "accepted", and the reason those are
 * separate states: the customer's document is verified against the quotation
 * it answers before anything is committed. The quoted total and the customer's
 * stated total both appear, and a variance between them is reported rather
 * than reconciled quietly.
 */
export default async function CustomerPurchaseOrderPage({ params }: { params: Params }) {
  await requireMedicalStaff("/medicals/admin/customer-purchase-orders");
  const { id } = await params;

  const po = await medicalDb.customerPurchaseOrder.findUnique({
    where: { id },
    include: {
      organisation: { select: { id: true, name: true } },
      quotation: { select: { id: true, reference: true, status: true } },
      tender: { select: { id: true, reference: true, title: true } },
      salesOrder: {
        select: { id: true, reference: true, fulfilmentStatus: true, paymentStatus: true },
      },
      items: {
        orderBy: { position: "asc" },
        include: {
          product: {
            select: { id: true, sku: true, name: true, stockOnHand: true, stockReserved: true },
          },
        },
      },
    },
  });
  if (!po) notFound();

  const ourTotal = sum(po.items.map((item) => toPesewas(item.lineTotal)));
  const theirTotal = toPesewas(po.totalValue);
  // Only meaningful once they have told us a figure. Zero means they did not,
  // not that they think the order is worth nothing.
  const difference = theirTotal > 0 ? theirTotal - ourTotal : 0;

  const decided = Boolean(po.salesOrderId) || po.status === "REJECTED" || po.status === "CANCELLED";

  const lines = po.items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: toPesewas(item.unitPrice),
    free: item.product
      ? Math.max(0, item.product.stockOnHand - item.product.stockReserved)
      : null,
  }));

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={po.reference}
        subtitle={[
          po.organisation?.name,
          po.customerReference ? `Customer reference ${po.customerReference}` : null,
          `Received ${formatDate(po.receivedAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={FileSignature}
        back={{ href: "/medicals/admin/customer-purchase-orders", label: "Customer purchase orders" }}
      >
        <customerPoStatus.Badge status={po.status as never} className="self-center" />
      </ConsoleHeader>

      {difference !== 0 ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            The customer&rsquo;s document states {formatPesewas(theirTotal)}; the quoted line
            items total {formatPesewas(ourTotal)} — a variance of{" "}
            <span className="font-figures font-semibold">{formatPesewas(difference)}</span>.
            Resolve it with the customer before accepting.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Line items" value={String(po.items.length)} />
        <StatCard
          label="Quoted total"
          value={formatPesewas(ourTotal)}
          hint={po.currency === "GHS" ? undefined : po.currency}
        />
        <StatCard
          label="Customer total"
          value={theirTotal > 0 ? formatPesewas(theirTotal) : "Not stated"}
          tone={difference !== 0 ? "attention" : "default"}
        />
        <StatCard
          label="Required by"
          value={po.expectedDeliveryAt ? formatDate(po.expectedDeliveryAt) : "Not stated"}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="medi-panel p-5">
          <PanelHeading title="Source documents" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Quotation">
              {po.quotation ? (
                <span className="font-figures font-semibold">{po.quotation.reference}</span>
              ) : (
                "Issued without a quotation"
              )}
            </Detail>
            <Detail label="Tender">
              {po.tender ? (
                <MedicalLink
                  href={`/medicals/admin/tenders/${po.tender.id}`}
                  className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {po.tender.reference}
                </MedicalLink>
              ) : (
                "Not tender-related"
              )}
            </Detail>
            <Detail label="Received via">{po.receivedVia.toLowerCase()}</Detail>
            <Detail label="Payment terms">{po.paymentTerms || "Not stated"}</Detail>
            <Detail label="Delivery address">{po.deliveryTo || "Not stated"}</Detail>
            {po.documentUrl ? (
              <Detail label="Customer document">
                <a
                  href={po.documentUrl}
                  className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Open attachment
                </a>
              </Detail>
            ) : null}
          </dl>
        </div>

        <div className="medi-panel p-5">
          <PanelHeading title="Review and outcome" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Reviewed">
              {po.reviewedAt ? formatDateTime(po.reviewedAt) : "Not yet"}
            </Detail>
            <Detail label="Sales order">
              {po.salesOrder ? (
                <MedicalLink
                  href={`/medicals/admin/customer-orders/${po.salesOrder.id}`}
                  className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {po.salesOrder.reference}
                </MedicalLink>
              ) : (
                "None — not yet accepted"
              )}
            </Detail>
            {po.rejectionReason ? (
              <Detail label="Reason for rejection">{po.rejectionReason}</Detail>
            ) : null}
            {po.notes ? <Detail label="Notes">{po.notes}</Detail> : null}
          </dl>
          {po.salesOrder ? (
            <p className="medi-meta mt-4 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
              A sales order exists, which is a commitment to supply — not a dispatch and not a
              payment. Both are tracked on the sales order itself.
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <PanelHeading
          title="Line items"
          subtitle="As ordered by the customer, at the prices quoted."
        />
        <ConsoleTable
          minWidth={820}
          columns={[
            "Description",
            { label: "Quantity ordered", numeric: true },
            { label: "Unit price", numeric: true },
            { label: "Line total", numeric: true },
            { label: "Quantity accepted", numeric: true },
          ]}
          empty={{
            title: "No line items",
            body: "This purchase order was recorded without line items. Link it to the quotation it accepts.",
          }}
        >
          {po.items.map((item) => (
            <Row key={item.id}>
              <td className={tdKey}>
                {item.description}
                {item.product ? (
                  <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                    <span className="font-figures">{item.product.sku}</span>
                  </span>
                ) : null}
              </td>
              <td className={tdNum}>
                {item.quantity} {item.unit}
              </td>
              <td className={tdNum}>{formatPesewas(toPesewas(item.unitPrice))}</td>
              <td className={tdNum}>{formatPesewas(toPesewas(item.lineTotal))}</td>
              <td className={tdNum}>
                {item.isAccepted ? (
                  <span
                    className={
                      item.acceptedQuantity < item.quantity ? "text-medi-warning" : "text-medi-body"
                    }
                  >
                    {item.acceptedQuantity}
                  </span>
                ) : (
                  <span className="medi-meta text-medi-muted">—</span>
                )}
              </td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {!decided && po.items.length > 0 ? (
        <>
          <section>
            <PanelHeading
              title="Acceptance"
              subtitle="Per line item and per quantity. Each field defaults to the quantity ordered."
            />
            <div className="mt-4">
              <AcceptCustomerPoForm purchaseOrderId={po.id} lines={lines} />
            </div>
          </section>

          <section>
            <PanelHeading title="Rejection" />
            <div className="mt-4">
              <RejectCustomerPoForm purchaseOrderId={po.id} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="medi-label text-medi-muted">{label}</dt>
      <dd className="text-right text-[0.8125rem] text-medi-ink">{children}</dd>
    </div>
  );
}
