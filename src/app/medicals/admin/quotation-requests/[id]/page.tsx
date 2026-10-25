import { notFound } from "next/navigation";
import { Inbox, Lightbulb } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import {
  DraftQuotationForm,
  RequestStatusForm,
  TakeRequestForm,
} from "@/components/medical/console/QuotationForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getQuotationRequest } from "@/lib/medical/quotations/queries";
import {
  EVENT_LABELS,
  quotationStatus,
  requestStatus,
  REQUEST_SOURCES,
} from "@/lib/medical/quotations/display";
import { effectiveStatus } from "@/lib/medical/quotations/status";
import { canSeeCost } from "@/lib/medical/roles";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime, relativeDays } from "@/lib/medical/format";

type Params = Promise<{ id: string }>;

/**
 * One request: what was asked for, and what has been offered against it.
 *
 * The stock column on the lines is the useful part. A salesperson pricing a
 * request needs to know what is on the shelf before they promise a lead time,
 * and a line with nothing behind it is a line that needs a supplier price
 * before it can be quoted at all.
 */
export default async function QuotationRequestPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/quotation-requests");
  const { id } = await params;

  const request = await getQuotationRequest(id);
  if (!request) notFound();

  const showCost = canSeeCost(staff.role);
  const closed = ["DECLINED", "CANCELLED", "CONVERTED", "EXPIRED"].includes(request.status);
  const indicative = request.items.reduce(
    (total, item) => total + item.quantity * toPesewas(item.product?.price ?? 0),
    0,
  );

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={request.reference}
        subtitle={[
          request.organisation?.name || request.institutionName || request.contactName,
          REQUEST_SOURCES[request.source] ?? request.source.toLowerCase(),
          `submitted ${formatDate(request.submittedAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={Inbox}
        back={{ href: "/medicals/admin/quotation-requests", label: "Quotation requests" }}
      >
        <requestStatus.Badge status={request.status as never} className="self-center" />
      </ConsoleHeader>

      {request.specialRequest ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-info-soft px-3.5 py-3 text-medi-info">
          <Lightbulb className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Asked for outside the catalogue: {request.specialRequest} — it comes across onto a
            quotation as a line to price by hand.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Line items" value={String(request.items.length)} />
        <StatCard
          label="Needed by"
          value={request.requiredBy ? formatDate(request.requiredBy) : "Not stated"}
          hint={request.requiredBy ? relativeDays(request.requiredBy) : undefined}
        />
        <StatCard label="Documents raised" value={String(request.quotations.length)} />
        <StatCard
          label="At catalogue prices"
          value={indicative > 0 ? formatPesewas(indicative) : "Not priceable yet"}
          hint="Indicative only — nothing has been offered"
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="medi-panel p-5">
          <PanelHeading title="Who asked" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="Institution">
              {request.organisation ? (
                <MedicalLink
                  href={`/medicals/admin/institutions/${request.organisation.id}`}
                  className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
                >
                  {request.organisation.name}
                </MedicalLink>
              ) : (
                request.institutionName || "Not given"
              )}
            </Detail>
            <Detail label="Contact">{request.contactName || request.customer?.name || "—"}</Detail>
            <Detail label="Email">{request.contactEmail || request.customer?.email || "—"}</Detail>
            <Detail label="Telephone">
              {request.contactPhone || request.customer?.phone || "—"}
            </Detail>
            <Detail label="Deliver to">{request.deliverTo || "Not stated"}</Detail>
            <Detail label="Has an account">{request.customer ? "Yes" : "No"}</Detail>
          </dl>
          {request.notes ? (
            <p className="medi-prose mt-4 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-[0.8125rem] text-medi-teal-800">
              &ldquo;{request.notes}&rdquo;
            </p>
          ) : null}
        </div>

        <div className="medi-panel p-5">
          <PanelHeading title="Where it is" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="With">
              {request.assignee?.name ?? <span className="text-medi-warning">Nobody</span>}
            </Detail>
            <Detail label="Submitted">{formatDateTime(request.submittedAt)}</Detail>
            <Detail label="Closed">
              {request.closedAt ? formatDateTime(request.closedAt) : "Still open"}
            </Detail>
          </dl>
          {!closed ? (
            <div className="mt-5 border-t border-medi-rule pt-5">
              <TakeRequestForm
                requestId={request.id}
                taken={Boolean(request.assignee) && request.assignee?.id !== staff.staffId}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <PanelHeading
          title="What they asked for"
          subtitle="Their wording, kept as written. Free stock is what the shelf could cover today."
        />
        <ConsoleTable
          minWidth={showCost ? 900 : 780}
          columns={[
            "What they asked for",
            "Matched product",
            { label: "Quantity", numeric: true },
            { label: "Free stock", numeric: true },
            { label: "Catalogue price", numeric: true },
            ...(showCost ? [{ label: "Our cost", numeric: true }] : []),
          ]}
          empty={{
            title: "No line items",
            body: "The request carries no lines — only the note or the off-catalogue ask above.",
          }}
        >
          {request.items.map((item) => {
            const free = item.product
              ? Math.max(0, item.product.stockOnHand - item.product.stockReserved)
              : null;
            return (
              <Row key={item.id}>
                <td className={tdKey}>
                  {item.description}
                  {item.catalogueNumber ? (
                    <span className="medi-meta font-figures mt-0.5 block font-normal text-medi-muted">
                      {item.catalogueNumber}
                    </span>
                  ) : null}
                  {item.notes ? (
                    <span className="medi-meta mt-0.5 block max-w-prose font-normal text-medi-muted">
                      {item.notes}
                    </span>
                  ) : null}
                </td>
                <td className={td}>
                  {item.product ? (
                    <MedicalLink
                      href={`/medicals/admin/products/${item.product.id}`}
                      className="medi-focus rounded hover:text-medi-teal-700"
                    >
                      {item.product.name}
                    </MedicalLink>
                  ) : (
                    <StatusBadge label="Not matched" tone="warn" />
                  )}
                </td>
                <td className={tdNum}>
                  {item.quantity} {item.unit}
                </td>
                <td className={tdNum}>
                  {free === null ? (
                    <span className="text-medi-muted">—</span>
                  ) : free >= item.quantity ? (
                    free
                  ) : (
                    <span className="text-medi-warning">{free}</span>
                  )}
                </td>
                <td className={tdNum}>
                  {item.product ? (
                    formatPesewas(toPesewas(item.product.price))
                  ) : (
                    <span className="text-medi-muted">To price</span>
                  )}
                </td>
                {showCost ? (
                  <td className={tdNum}>
                    {item.product ? (
                      formatPesewas(toPesewas(item.product.purchaseCost))
                    ) : (
                      <span className="text-medi-muted">—</span>
                    )}
                  </td>
                ) : null}
              </Row>
            );
          })}
        </ConsoleTable>
      </section>

      {request.quotations.length > 0 ? (
        <section>
          <PanelHeading
            title="Documents raised against it"
            subtitle="Newest version first. An issued version is never edited — a change is a new version."
          />
          <ConsoleTable
            minWidth={820}
            columns={[
              "Reference",
              "Kind",
              "Status",
              "Issued",
              "Valid until",
              { label: "Total", numeric: true },
            ]}
            empty={{ title: "None yet", body: "Draft one below." }}
          >
            {request.quotations.map((doc) => (
              <Row key={doc.id}>
                <td className={tdKey}>
                  <MedicalLink
                    href={`/medicals/admin/quotations/${doc.id}`}
                    className="medi-focus font-figures rounded hover:text-medi-teal-700"
                  >
                    {doc.reference} v{doc.version}
                  </MedicalLink>
                </td>
                <td className={td}>
                  {doc.documentType === "PROFORMA" ? "Proforma invoice" : "Quotation"}
                </td>
                <td className={td}>
                  <quotationStatus.Badge
                    status={effectiveStatus({ status: doc.status, validUntil: doc.validUntil }) as never}
                  />
                </td>
                <td className={td}>{doc.issuedAt ? formatDate(doc.issuedAt) : "Not issued"}</td>
                <td className={td}>{doc.validUntil ? formatDate(doc.validUntil) : "—"}</td>
                <td className={tdNum}>{formatPesewas(toPesewas(doc.totalPayable))}</td>
              </Row>
            ))}
          </ConsoleTable>
        </section>
      ) : null}

      {!closed ? (
        <>
          <section>
            <PanelHeading
              title="Draft a document"
              subtitle="Lines are copied across at catalogue prices as a starting point, not as an answer."
            />
            <div className="mt-4">
              <DraftQuotationForm requestId={request.id} />
            </div>
          </section>

          <section>
            <PanelHeading title="Move it along" />
            <div className="mt-4">
              <RequestStatusForm requestId={request.id} status={request.status} />
            </div>
          </section>
        </>
      ) : null}

      {request.events.length > 0 ? (
        <section>
          <PanelHeading title="Timeline" subtitle="Append-only." />
          <ul className="medi-panel mt-3 divide-y divide-medi-rule">
            {request.events.map((event) => (
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
