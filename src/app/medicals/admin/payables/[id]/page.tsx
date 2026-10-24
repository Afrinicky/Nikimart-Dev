import { notFound } from "next/navigation";
import { AlertTriangle, Banknote, CheckCircle2 } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MatchInvoiceForm, SupplierPaymentForm } from "@/components/medical/console/PayableForms";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getSupplierInvoice } from "@/lib/medical/procurement/queries";
import { discrepancyStatus, supplierInvoiceStatus } from "@/lib/medical/procurement/status";
import { canSettle, outstandingOn } from "@/lib/medical/procurement/matching";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";
import { canApproveSpending } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

export default async function PayablePage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/payables");
  const { id } = await params;
  const result = await getSupplierInvoice(id);
  if (!result) notFound();

  const { invoice, match } = result;
  const amount = toPesewas(invoice.amountGhs);
  const paid = toPesewas(invoice.amountPaid);
  const outstanding = outstandingOn(amount, paid);
  const payable = canSettle(match, invoice.isMatched);
  const mayPay = canApproveSpending(staff.role);

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={invoice.reference}
        subtitle={`${invoice.supplier.name}${invoice.supplierReference ? ` · their invoice ${invoice.supplierReference}` : ""}`}
        icon={Banknote}
        back={{ href: "/medicals/admin/payables", label: "Payables" }}
      >
        <supplierInvoiceStatus.Badge status={invoice.status as never} className="self-center" />
      </ConsoleHeader>

      {/* The verdict, before the table. Somebody opening this invoice wants to
          know whether it can be paid, not to work it out from eight columns. */}
      {match.isClean ? (
        <p className="flex items-start gap-2 rounded-xl bg-medi-success-soft px-4 py-3 text-[0.8125rem] text-medi-success">
          <CheckCircle2 className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>{match.summary}</span>
        </p>
      ) : (
        <div
          className={
            invoice.isMatched
              ? "rounded-xl bg-medi-warning-soft px-4 py-3 text-[0.8125rem] text-medi-warning"
              : "rounded-xl bg-medi-danger-soft px-4 py-3 text-[0.8125rem] text-medi-danger"
          }
        >
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <span>{match.summary}</span>
          </p>
          <p className="mt-1.5 pl-6">
            Expected {formatPesewas(match.expectedTotal)} against{" "}
            {formatPesewas(match.invoicedTotal)} billed — a difference of{" "}
            <span className="font-figures font-semibold">
              {formatPesewas(match.totalVariance)}
            </span>
            .
            {invoice.isMatched
              ? " Somebody has accepted these differences, so the invoice can be paid."
              : " It cannot be paid until somebody accepts the differences."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoice" value={formatPesewas(amount)} hint={invoice.currency} />
        <StatCard label="Paid" value={formatPesewas(paid)} />
        <StatCard
          label="Outstanding"
          value={formatPesewas(outstanding)}
          tone={outstanding > 0 ? "attention" : "default"}
        />
        <StatCard label="Due" value={formatDate(invoice.dueAt)} />
      </div>

      <section>
        <PanelHeading
          title="Ordered, accepted, invoiced"
          subtitle="The three figures that should agree. Where they do not, the difference is priced."
        />
        <ConsoleTable
          minWidth={980}
          columns={[
            "Line",
            { label: "Ordered", numeric: true },
            { label: "Accepted", numeric: true },
            { label: "Invoiced", numeric: true },
            { label: "PO price", numeric: true },
            { label: "Billed price", numeric: true },
            { label: "Difference", numeric: true },
            "Match",
          ]}
          empty={{
            title: "No lines",
            body: "This invoice was recorded without a purchase order, so there is nothing to match it against.",
          }}
        >
          {invoice.items.map((item) => {
            const line = match.lines.find((l) => l.id === item.id);
            return (
              <Row key={item.id}>
                <td className={tdKey}>
                  {item.description}
                  {line?.note ? (
                    <span className="medi-meta mt-0.5 block font-normal text-medi-danger">
                      {line.note}
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>{item.quantityOrdered}</td>
                <td className={tdNum}>{item.quantityAccepted}</td>
                <td className={tdNum}>
                  {item.quantityInvoiced}
                  {line && line.quantityVariance !== 0 ? (
                    <span className="medi-meta ml-1 font-normal text-medi-danger">
                      {line.quantityVariance > 0 ? "+" : ""}
                      {line.quantityVariance}
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>{formatPesewas(toPesewas(item.unitCostOrdered))}</td>
                <td className={tdNum}>{formatPesewas(toPesewas(item.unitPrice))}</td>
                <td className={tdNum}>
                  {line && line.valueVariance !== 0 ? (
                    <span className="font-semibold text-medi-danger">
                      {formatPesewas(line.valueVariance)}
                    </span>
                  ) : (
                    <span className="text-medi-muted">—</span>
                  )}
                </td>
                <td className={td}>
                  <discrepancyStatus.Badge status={(line?.kind ?? "NONE") as never} />
                </td>
              </Row>
            );
          })}
        </ConsoleTable>
      </section>

      {invoice.purchaseOrder ? (
        <p className="medi-meta text-medi-muted">
          Against{" "}
          <MedicalLink
            href={`/medicals/admin/purchase-orders/${invoice.purchaseOrder.id}`}
            className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
          >
            {invoice.purchaseOrder.reference}
          </MedicalLink>
        </p>
      ) : null}

      {invoice.payments.length > 0 ? (
        <section>
          <PanelHeading title="Payments" />
          <ConsoleTable
            minWidth={640}
            columns={["Reference", "Paid", "Method", { label: "Amount", numeric: true }, "Note"]}
            empty={{ title: "Nothing paid", body: "No payments have gone out yet." }}
          >
            {invoice.payments.map((payment) => (
              <Row key={payment.id}>
                <td className={tdKey}>
                  <span className="font-figures">{payment.reference}</span>
                </td>
                <td className={td}>{formatDate(payment.paidAt)}</td>
                <td className={td}>{payment.method}</td>
                <td className={tdNum}>{formatPesewas(toPesewas(payment.amountGhs))}</td>
                <td className={td}>{payment.note || "—"}</td>
              </Row>
            ))}
          </ConsoleTable>
        </section>
      ) : null}

      {mayPay ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {!match.isClean && !invoice.isMatched ? (
            <section>
              <PanelHeading
                title="Accept the differences"
                subtitle="A deliberate act, with your name against it. Only then can the invoice be paid."
              />
              <div className="mt-4">
                <MatchInvoiceForm invoiceId={invoice.id} />
              </div>
            </section>
          ) : null}

          {outstanding > 0 ? (
            <section>
              <PanelHeading
                title="Record a payment"
                subtitle="Part payments are normal. The status follows what has actually gone out."
              />
              <div className="mt-4">
                <SupplierPaymentForm
                  invoiceId={invoice.id}
                  outstanding={outstanding}
                  currency={invoice.currency}
                  blocked={!payable}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
