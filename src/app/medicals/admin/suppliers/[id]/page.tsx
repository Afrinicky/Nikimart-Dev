import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { SupplierForm } from "@/components/medical/console/SupplierForm";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getSupplier, getSupplierBalance } from "@/lib/medical/procurement/queries";
import { purchaseOrderStatus, supplierInvoiceStatus } from "@/lib/medical/procurement/status";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";
import { canSeeCost } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

export default async function SupplierPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/suppliers");
  const { id } = await params;

  const [supplier, balance] = await Promise.all([getSupplier(id), getSupplierBalance(id)]);
  if (!supplier) notFound();

  const showMoney = canSeeCost(staff.role);

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={supplier.name}
        subtitle={`${supplier.code} · ${supplier.country} · trades in ${supplier.currency}`}
        icon={Users}
        back={{ href: "/medicals/admin/suppliers", label: "Suppliers" }}
      />

      {showMoney ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Invoiced to date" value={formatPesewas(balance.invoiced)} />
          <StatCard label="Paid to date" value={formatPesewas(balance.paid)} />
          <StatCard
            label="Outstanding balance"
            value={formatPesewas(balance.outstanding)}
            tone={balance.outstanding > 0 ? "attention" : "default"}
          />
          <StatCard label="Open purchase orders" value={String(balance.openOrders)} />
        </div>
      ) : null}

      <section>
        <PanelHeading title="Recent purchase orders" />
        <ConsoleTable
          minWidth={720}
          columns={[
            "Reference",
            "Status",
            "Ordered",
            "Expected",
            { label: "Landed cost (GH₵)", numeric: true },
          ]}
          empty={{ title: "No orders yet", body: "Nothing has been bought from this supplier." }}
        >
          {supplier.purchaseOrders.map((order) => (
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
                <purchaseOrderStatus.Badge status={order.status as never} />
              </td>
              <td className={td}>{formatDate(order.orderedAt)}</td>
              <td className={td}>{formatDate(order.expectedAt)}</td>
              <td className={tdNum}>
                {showMoney ? formatPesewas(toPesewas(order.totalLandedGhs)) : "—"}
              </td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {showMoney ? (
        <section>
          <PanelHeading title="Supplier invoices" />
          <ConsoleTable
            minWidth={820}
            columns={[
              "Reference",
              "Their number",
              "Status",
              "Issued",
              "Due",
              { label: "Amount", numeric: true },
              { label: "Outstanding", numeric: true },
            ]}
            empty={{ title: "No invoices", body: "Nothing has been billed by this supplier." }}
          >
            {supplier.invoices.map((invoice) => {
              const outstanding = toPesewas(invoice.amountGhs) - toPesewas(invoice.amountPaid);
              return (
                <Row key={invoice.id}>
                  <td className={tdKey}>
                    <MedicalLink
                      href={`/medicals/admin/payables/${invoice.id}`}
                      className="medi-focus font-figures rounded hover:text-medi-teal-700"
                    >
                      {invoice.reference}
                    </MedicalLink>
                  </td>
                  <td className={td}>
                    <span className="font-figures">{invoice.supplierReference || "—"}</span>
                  </td>
                  <td className={td}>
                    <supplierInvoiceStatus.Badge status={invoice.status as never} />
                  </td>
                  <td className={td}>{formatDate(invoice.issuedAt)}</td>
                  <td className={td}>{formatDate(invoice.dueAt)}</td>
                  <td className={tdNum}>{formatPesewas(toPesewas(invoice.amountGhs))}</td>
                  <td className={tdNum}>{formatPesewas(Math.max(0, outstanding))}</td>
                </Row>
              );
            })}
          </ConsoleTable>
        </section>
      ) : null}

      <section>
        <PanelHeading title="Supplier details" subtitle="Internal record. None of it reaches the storefront." />
        <div className="mt-4">
          <SupplierForm
            supplier={{ ...supplier, minimumOrderValue: String(supplier.minimumOrderValue) }}
          />
        </div>
      </section>
    </div>
  );
}
