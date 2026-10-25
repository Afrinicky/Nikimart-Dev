import { notFound } from "next/navigation";
import { FileText, History, Lock } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import {
  AddLineForm,
  AnswerForm,
  CancelQuotationForm,
  ConvertForm,
  IssueForm,
  QuotationEditor,
  ReviseForm,
  SendForm,
} from "@/components/medical/console/QuotationForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getQuotation } from "@/lib/medical/quotations/queries";
import { listProducts } from "@/lib/medical/admin/catalogue-queries";
import { EVENT_LABELS, quotationStatus } from "@/lib/medical/quotations/display";
import { can, effectiveStatus, nextAction } from "@/lib/medical/quotations/status";
import { marginOf } from "@/lib/medical/quotations/pricing";
import { canSeeCost } from "@/lib/medical/roles";
import { formatPesewas, formatRate, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime } from "@/lib/medical/format";

type Params = Promise<{ id: string }>;

/**
 * One quotation or proforma, and everything that may be done to it.
 *
 * Which actions appear is decided by `status.ts` and nothing else — the same
 * table the server actions check — so a button can never offer a move the
 * action will refuse. That is the whole reason the table is a module.
 *
 * A lapsed document reads as lapsed here even though nothing has swept the
 * database: the validity date decides, so nobody is shown a price that is no
 * longer on offer.
 */
export default async function QuotationPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/quotations");
  const { id } = await params;

  const quotation = await getQuotation(id);
  if (!quotation) notFound();

  const status = effectiveStatus(quotation);
  const showCost = canSeeCost(staff.role);
  const editable = can(status, "EDIT");

  // Only loaded for a draft, and only to fill the add-line select.
  const { rows: products } = editable
    ? await listProducts({ status: "ACTIVE", take: 200 })
    : { rows: [] };

  const unpriced = quotation.items.filter((item) => toPesewas(item.unitPrice) <= 0).length;
  const margin = showCost
    ? marginOf(
        quotation.items.map((item) => ({
          quantity: item.quantity,
          unitCost: toPesewas(item.unitCostAtIssue),
          total: toPesewas(item.lineTotal),
        })),
      )
    : null;

  const isProforma = quotation.documentType === "PROFORMA";

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={`${quotation.reference} v${quotation.version}`}
        subtitle={[
          isProforma ? "Proforma invoice" : "Quotation",
          quotation.organisation?.name || quotation.billToName,
          quotation.issuedAt ? `issued ${formatDate(quotation.issuedAt)}` : "not yet issued",
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={FileText}
        back={{ href: "/medicals/admin/quotations", label: "Quotations" }}
      >
        <quotationStatus.Badge status={status as never} className="self-center" />
        {isProforma ? <StatusBadge label="Proforma" tone="info" className="self-center" /> : null}
      </ConsoleHeader>

      {!editable ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-surface px-3.5 py-3 text-medi-muted">
          <Lock className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Issued, so read-only. The customer has a copy of this version, and a document that
            changes after it has been sent is not a document. A price that has to change becomes a
            new version.
          </span>
        </p>
      ) : null}

      {isProforma ? (
        <p className="medi-meta rounded-xl bg-medi-info-soft px-3.5 py-3 text-medi-info">
          A proforma invoice states agreed terms so a finance office can release funds. It is not a
          receipt and not a tax invoice, and the document says so on its face.
        </p>
      ) : null}

      {quotation.supersedes || quotation.supersededBy ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
          <History className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            {quotation.supersedes ? (
              <>
                This replaces{" "}
                <MedicalLink
                  href={`/medicals/admin/quotations/${quotation.supersedes.id}`}
                  className="medi-focus font-figures rounded font-semibold underline"
                >
                  v{quotation.supersedes.version}
                </MedicalLink>
                {quotation.revisionReason ? `: ${quotation.revisionReason}` : ""}.{" "}
              </>
            ) : null}
            {quotation.supersededBy ? (
              <>
                It has itself been replaced by{" "}
                <MedicalLink
                  href={`/medicals/admin/quotations/${quotation.supersededBy.id}`}
                  className="medi-focus font-figures rounded font-semibold underline"
                >
                  v{quotation.supersededBy.version}
                </MedicalLink>
                .
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total payable"
          value={formatPesewas(toPesewas(quotation.totalPayable))}
          hint={quotation.currency === "GHS" ? undefined : quotation.currency}
        />
        <StatCard label="Line items" value={String(quotation.items.length)} />
        <StatCard
          label="Valid until"
          value={quotation.validUntil ? formatDate(quotation.validUntil) : "Not set"}
          tone={status === "EXPIRED" ? "attention" : "default"}
        />
        {margin ? (
          <StatCard
            label="Margin"
            value={formatRate(margin.rate)}
            hint={`${formatPesewas(margin.profit)} on ${formatPesewas(margin.revenue)}`}
          />
        ) : (
          <StatCard
            label="Waiting on"
            value={nextAction(status)}
            tone={["DRAFT", "ISSUED", "ACCEPTED"].includes(status) ? "attention" : "default"}
          />
        )}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="medi-panel p-5">
          <PanelHeading
            title="Addressed to"
            subtitle="As the document prints it, copied at drafting."
          />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Name">{quotation.billToName || "—"}</Detail>
            <Detail label="Contact">{quotation.billToContact || "—"}</Detail>
            <Detail label="Email">{quotation.billToEmail || "—"}</Detail>
            <Detail label="Telephone">{quotation.billToPhone || "—"}</Detail>
            <Detail label="Deliver to">{quotation.deliverToAddress || "Not stated"}</Detail>
            {quotation.billToTaxId ? (
              <Detail label="Tax identification">{quotation.billToTaxId}</Detail>
            ) : null}
            <Detail label="From the request">
              {quotation.request ? (
                <MedicalLink
                  href={`/medicals/admin/quotation-requests/${quotation.request.id}`}
                  className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {quotation.request.reference}
                </MedicalLink>
              ) : (
                "Raised directly"
              )}
            </Detail>
          </dl>
        </div>

        <div className="medi-panel p-5">
          <PanelHeading title="Where it has got to" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Issued">
              {quotation.issuedAt ? formatDateTime(quotation.issuedAt) : "Not yet"}
            </Detail>
            <Detail label="Issued by">{quotation.issuedBy?.name ?? "—"}</Detail>
            <Detail label="Sent">
              {quotation.sentAt ? formatDateTime(quotation.sentAt) : "Not yet"}
            </Detail>
            <Detail label="Read by customer">
              {quotation.firstViewedAt ? formatDateTime(quotation.firstViewedAt) : "Not recorded"}
            </Detail>
            <Detail label="Answered">
              {quotation.acceptedAt
                ? `Accepted ${formatDateTime(quotation.acceptedAt)}`
                : quotation.declinedAt
                  ? `Declined ${formatDateTime(quotation.declinedAt)}`
                  : "Not yet"}
            </Detail>
            {quotation.declineReason ? (
              <Detail label="They said">{quotation.declineReason}</Detail>
            ) : null}
          </dl>
          {quotation.salesOrders.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t border-medi-rule pt-4">
              {quotation.salesOrders.map((order) => (
                <li key={order.id} className="medi-meta">
                  <MedicalLink
                    href={`/medicals/admin/customer-orders/${order.id}`}
                    className="medi-focus font-figures rounded font-semibold text-medi-teal-700 hover:underline"
                  >
                    {order.reference}
                  </MedicalLink>{" "}
                  <span className="text-medi-muted">
                    {order.fulfilmentStatus.replace(/_/g, " ").toLowerCase()} ·{" "}
                    {order.paymentStatus.replace(/_/g, " ").toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section>
        <PanelHeading title="Lines" subtitle="As the document prints them." />
        <ConsoleTable
          minWidth={showCost ? 920 : 800}
          columns={[
            "Description",
            { label: "Quantity", numeric: true },
            { label: "Unit price", numeric: true },
            { label: "Discount", numeric: true },
            { label: "Line total", numeric: true },
            ...(showCost ? [{ label: "Cost at issue", numeric: true }] : []),
          ]}
          empty={{
            title: "No lines",
            body: "Add one below. A document with nothing on it cannot be issued.",
          }}
        >
          {quotation.items.map((item) => (
            <Row key={item.id}>
              <td className={tdKey}>
                {item.description}
                {item.detail ? (
                  <span className="medi-meta mt-0.5 block max-w-prose font-normal text-medi-muted">
                    {item.detail}
                  </span>
                ) : null}
                {item.catalogueNumber ? (
                  <span className="medi-meta font-figures mt-0.5 block font-normal text-medi-muted">
                    {item.catalogueNumber}
                  </span>
                ) : null}
                {item.isCustomLine ? (
                  <StatusBadge label="Typed by hand" tone="info" className="mt-1" />
                ) : null}
              </td>
              <td className={tdNum}>
                {item.quantity} {item.unit}
              </td>
              <td className={tdNum}>
                {toPesewas(item.unitPrice) > 0 ? (
                  formatPesewas(toPesewas(item.unitPrice))
                ) : (
                  <span className="text-medi-warning">Not priced</span>
                )}
              </td>
              <td className={tdNum}>
                {toPesewas(item.discountAmount) > 0 ? (
                  `−${formatPesewas(toPesewas(item.discountAmount))}`
                ) : (
                  <span className="text-medi-muted">—</span>
                )}
              </td>
              <td className={tdNum}>{formatPesewas(toPesewas(item.lineTotal))}</td>
              {showCost ? (
                <td className={tdNum}>
                  {toPesewas(item.unitCostAtIssue) > 0 ? (
                    formatPesewas(toPesewas(item.unitCostAtIssue))
                  ) : (
                    <span className="text-medi-muted">—</span>
                  )}
                </td>
              ) : null}
            </Row>
          ))}
        </ConsoleTable>

        {/* The terms sit outside the list, not inside it: a `dl` may only
            directly contain `dt`, `dd` and `div`, and a stray paragraph in
            there breaks how a screen reader walks the figures. */}
        <div className="medi-panel mt-4 p-5">
          <dl className="space-y-2">
            <Money label="Subtotal" value={toPesewas(quotation.subtotal)} />
            {toPesewas(quotation.discountAmount) > 0 ? (
              <Money label="Discount" value={-toPesewas(quotation.discountAmount)} />
            ) : null}
            {toPesewas(quotation.deliveryCharge) > 0 ? (
              <Money label="Delivery" value={toPesewas(quotation.deliveryCharge)} />
            ) : null}
            {toPesewas(quotation.handlingCharge) > 0 ? (
              <Money label="Handling" value={toPesewas(quotation.handlingCharge)} />
            ) : null}
            {toPesewas(quotation.otherCharge) > 0 ? (
              <Money
                label={quotation.otherChargeLabel || "Other charge"}
                value={toPesewas(quotation.otherCharge)}
              />
            ) : null}
            {toPesewas(quotation.taxAmount) > 0 ? (
              <Money label={quotation.taxLabel || "Tax"} value={toPesewas(quotation.taxAmount)} />
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-medi-rule pt-2">
              <dt className="text-[0.875rem] font-bold text-medi-ink">Total payable</dt>
              <dd className="font-figures text-[1.125rem] font-bold text-medi-ink">
                {formatPesewas(toPesewas(quotation.totalPayable))}
              </dd>
            </div>
          </dl>
          {quotation.paymentTerms ? (
            <p className="medi-meta mt-2 text-medi-muted">{quotation.paymentTerms}</p>
          ) : null}
        </div>
      </section>

      {editable ? (
        <>
          <section>
            <PanelHeading
              title="Add a line"
              subtitle="A catalogue product, or something typed by hand — installation, training, a part sourced to order."
            />
            <div className="mt-4">
              <AddLineForm
                quotationId={quotation.id}
                products={products.map((p) => ({
                  id: p.id,
                  label: `${p.catalogueNumber || p.sku} — ${p.name}`,
                }))}
              />
            </div>
          </section>

          <section>
            <PanelHeading title="Price it" subtitle="Totals are recomputed on the server on save." />
            <div className="mt-4">
              <QuotationEditor
                quotation={{
                  id: quotation.id,
                  discountKind: quotation.discountKind,
                  discountValue: rate(quotation.discountKind, quotation.discountValue),
                  deliveryCharge: amount(quotation.deliveryCharge),
                  handlingCharge: amount(quotation.handlingCharge),
                  otherCharge: amount(quotation.otherCharge),
                  otherChargeLabel: quotation.otherChargeLabel,
                  validUntil: quotation.validUntil
                    ? quotation.validUntil.toISOString().slice(0, 10)
                    : "",
                  paymentTerms: quotation.paymentTerms,
                  deliveryEstimate: quotation.deliveryEstimate,
                  notes: quotation.notes,
                  termsAndConditions: quotation.termsAndConditions,
                  billToName: quotation.billToName,
                  billToContact: quotation.billToContact,
                  billToEmail: quotation.billToEmail,
                  billToPhone: quotation.billToPhone,
                  billToAddress: quotation.billToAddress,
                  billToTaxId: quotation.billToTaxId,
                  deliverToAddress: quotation.deliverToAddress,
                }}
                lines={quotation.items.map((item) => ({
                  id: item.id,
                  description: item.description,
                  detail: item.detail,
                  catalogueNumber: item.catalogueNumber,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: amount(item.unitPrice),
                  discountKind: item.discountKind,
                  discountValue: rate(item.discountKind, item.discountValue),
                }))}
              />
            </div>
          </section>
        </>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {can(status, "ISSUE") ? (
          <div>
            <PanelHeading title="Issue it" />
            <div className="mt-4">
              <IssueForm
                quotationId={quotation.id}
                totalPayable={toPesewas(quotation.totalPayable)}
                unpriced={unpriced}
              />
            </div>
          </div>
        ) : null}

        {can(status, "SEND") ? (
          <div>
            <PanelHeading title="Send it" />
            <div className="mt-4">
              <SendForm quotationId={quotation.id} />
            </div>
          </div>
        ) : null}

        {can(status, "ACCEPT") ? (
          <div>
            <PanelHeading title="They accepted" />
            <div className="mt-4">
              <AnswerForm quotationId={quotation.id} accept />
            </div>
          </div>
        ) : null}

        {can(status, "DECLINE") ? (
          <div>
            <PanelHeading title="They declined" />
            <div className="mt-4">
              <AnswerForm quotationId={quotation.id} accept={false} />
            </div>
          </div>
        ) : null}

        {can(status, "CONVERT") ? (
          <div>
            <PanelHeading title="Raise the order" />
            <div className="mt-4">
              <ConvertForm
                quotationId={quotation.id}
                totalPayable={toPesewas(quotation.totalPayable)}
              />
            </div>
          </div>
        ) : null}

        {can(status, "REVISE") ? (
          <div>
            <PanelHeading title="Revise it" />
            <div className="mt-4">
              <ReviseForm quotationId={quotation.id} version={quotation.version} />
            </div>
          </div>
        ) : null}

        {can(status, "CANCEL") ? (
          <div>
            <PanelHeading title="Cancel it" />
            <div className="mt-4">
              <CancelQuotationForm quotationId={quotation.id} />
            </div>
          </div>
        ) : null}
      </section>

      {quotation.events.length > 0 ? (
        <section>
          <PanelHeading title="Timeline" subtitle="Append-only." />
          <ul className="medi-panel mt-3 divide-y divide-medi-rule">
            {quotation.events.map((event) => (
              <li key={event.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] font-semibold text-medi-ink">
                    {EVENT_LABELS[event.kind] ?? event.kind.toLowerCase()}
                  </span>
                  <span className="medi-meta font-figures text-medi-muted">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
                <p className="medi-prose mt-0.5 max-w-prose text-[0.8125rem] text-medi-body">
                  {event.summary}
                </p>
                {event.actorName ? (
                  <p className="medi-meta mt-0.5 text-medi-muted">{event.actorName}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
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

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[0.8125rem] text-medi-body">{label}</dt>
      <dd className="font-figures text-[0.8125rem] text-medi-ink">{formatPesewas(value)}</dd>
    </div>
  );
}

/** A money column as a form value. */
function amount(value: unknown): string {
  return (toPesewas(value as Parameters<typeof toPesewas>[0]) / 100).toFixed(2);
}

/**
 * A discount value as the form wants it.
 *
 * The column holds a rate for a percentage discount and money for a fixed one,
 * so the same field has to be read two ways. A percentage is shown as the
 * number somebody typed — 12.5, not 0.125.
 */
function rate(kind: string, value: unknown): string {
  if (kind === "PERCENT") {
    const asNumber = Number(String(value ?? "0"));
    return Number.isFinite(asNumber) ? String(asNumber * 100) : "0";
  }
  if (kind === "AMOUNT") return amount(value);
  return "0";
}
