import { notFound } from "next/navigation";
import { AlertTriangle, FileText, Gavel } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { TenderForm } from "@/components/medical/console/TenderForm";
import { TenderOutcomeForm } from "@/components/medical/console/TenderOutcomeForm";
import {
  PriceLineForm,
  StartSubmissionForm,
  SubmitTenderForm,
  TenderDocumentForm,
  TenderItemForm,
} from "@/components/medical/console/TenderItemForms";
import { requireMedicalStaff } from "@/lib/medical/session";
import { forForm } from "@/lib/medical/admin/for-form";
import { getTender, outcomeOf } from "@/lib/medical/tenders/queries";
import { itemOutcomeStatus, submissionStatus, tenderStatus } from "@/lib/medical/tenders/display";
import { deadlinePressure } from "@/lib/medical/tenders/status";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { formatDate, formatDateTime, relativeDays } from "@/lib/medical/format";
import { canSeeCost } from "@/lib/medical/roles";

type Params = Promise<{ id: string }>;

export default async function TenderPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/tenders");
  const { id } = await params;

  const [tender, products, organisations] = await Promise.all([
    getTender(id),
    readMedical(
      () =>
        medicalDb.medicalProduct.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, sku: true },
          orderBy: { name: "asc" },
          take: 400,
        }),
      [],
    ),
    readMedical(
      () =>
        medicalDb.organisation.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      [],
    ),
  ]);
  if (!tender) notFound();

  const showCost = canSeeCost(staff.role);
  const latest = tender.submissions[0] ?? null;
  const outcome = latest ? outcomeOf(latest.items) : null;
  const pressure = deadlinePressure(tender.submissionDeadline);
  const missingDocuments = tender.documents.filter((doc) => doc.isRequired && !doc.isProvided);

  return (
    <div className="space-y-8">
      <ConsoleHeader
        title={tender.title}
        subtitle={`${tender.reference}${tender.tenderNumber ? ` · their ref ${tender.tenderNumber}` : ""} · ${tender.organisation.name}`}
        icon={Gavel}
        back={{ href: "/medicals/admin/tenders", label: "Tenders" }}
      >
        <tenderStatus.Badge status={tender.status as never} className="self-center" />
      </ConsoleHeader>

      {pressure === "critical" && tender.submissionDeadline ? (
        <p className="flex items-start gap-2 rounded-xl bg-medi-danger-soft px-4 py-3 text-[0.8125rem] font-semibold text-medi-danger">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Submission closes {relativeDays(tender.submissionDeadline)} —{" "}
            {formatDate(tender.submissionDeadline)}.
            {missingDocuments.length > 0
              ? ` Still missing: ${missingDocuments.map((d) => d.label).join(", ")}.`
              : ""}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Published line items" value={String(tender.items.length)} />
        <StatCard
          label="Deadline"
          value={formatDate(tender.submissionDeadline)}
          tone={pressure === "critical" ? "attention" : "default"}
        />
        {outcome ? (
          <StatCard
            label="Line items awarded"
            value={`${outcome.awardedLines + outcome.partiallyAwardedLines} of ${outcome.bidLines}`}
            hint={outcome.hitRate !== null ? `${outcome.hitRate}% hit rate` : "Still being evaluated"}
          />
        ) : (
          <StatCard label="Line items bid" value="—" hint="No submission prepared yet" />
        )}
        {outcome && showCost ? (
          <StatCard
            label="Awarded value"
            value={formatPesewas(outcome.awardedValue)}
            hint={`Margin ${formatPesewas(outcome.awardedMargin)}`}
          />
        ) : (
          <StatCard label="Contract end" value={formatDate(tender.contractEndAt)} />
        )}
      </div>

      {/* Published requirements — their list, in their words. */}
      <section>
        <PanelHeading
          title="Published requirement"
          subtitle="The institution's published schedule, kept exactly as written. Our submission is a separate document and the two differ in ways that decide the award."
        />
        <ConsoleTable
          minWidth={980}
          columns={[
            "Lot",
            "Requirement",
            { label: "Quantity", numeric: true },
            "Acceptable brands",
            { label: "Minimum shelf life", numeric: true },
            "Our match",
          ]}
          empty={{
            title: "No requirements recorded",
            body: "Add the lines the institution published. A submission is prepared from them, so nothing is missed.",
          }}
        >
          {tender.items.map((item) => {
            const brands = safeList(item.acceptableBrands);
            return (
              <Row key={item.id}>
                <td className={td}>
                  <span className="font-figures">{item.lotNumber || "—"}</span>
                </td>
                <td className={tdKey}>
                  {item.description}
                  {item.specification ? (
                    <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                      {item.specification}
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>
                  {item.quantity} {item.unit}
                </td>
                <td className={td}>{brands.length > 0 ? brands.join(", ") : "Not stated"}</td>
                <td className={tdNum}>
                  {item.minimumShelfLifeMonths > 0 ? `${item.minimumShelfLifeMonths}m` : "—"}
                </td>
                <td className={td}>
                  {item.product ? (
                    <>
                      {item.product.name}
                      <span className="medi-meta font-figures mt-0.5 block text-medi-muted">
                        {item.product.sku}
                      </span>
                    </>
                  ) : (
                    <span className="text-medi-muted">To source</span>
                  )}
                </td>
              </Row>
            );
          })}
        </ConsoleTable>
        <div className="mt-4">
          <TenderItemForm tenderId={tender.id} products={products} />
        </div>
      </section>

      {/* Required documents. A bid thrown out for a missing certificate cost
          the same to prepare as one that was read. */}
      <section>
        <PanelHeading
          title="Required documents"
          subtitle="A submission cannot be marked sent while a required document is missing."
        />
        {tender.documents.length > 0 ? (
          <ConsoleTable
            minWidth={640}
            columns={["Document", "Required", "Have it", "Expires", "Note"]}
            empty={{ title: "None listed", body: "" }}
          >
            {tender.documents.map((doc) => {
              const lapsed = doc.expiresAt && doc.expiresAt < new Date();
              return (
                <Row key={doc.id}>
                  <td className={tdKey}>{doc.label}</td>
                  <td className={td}>
                    <StatusBadge
                      label={doc.isRequired ? "Required" : "Optional"}
                      tone={doc.isRequired ? "warn" : "neutral"}
                    />
                  </td>
                  <td className={td}>
                    <StatusBadge
                      label={doc.isProvided ? "Attached" : "Missing"}
                      tone={doc.isProvided ? "good" : "bad"}
                    />
                  </td>
                  <td className={td}>
                    {formatDate(doc.expiresAt)}
                    {lapsed ? (
                      <StatusBadge label="Lapsed" tone="bad" className="ml-2 align-middle" />
                    ) : null}
                  </td>
                  <td className={td}>{doc.note || "—"}</td>
                </Row>
              );
            })}
          </ConsoleTable>
        ) : null}
        <div className="mt-4">
          <TenderDocumentForm tenderId={tender.id} />
        </div>
      </section>

      {/* Our submission. */}
      <section>
        <PanelHeading
          title="Our submission"
          subtitle={
            latest
              ? `${latest.reference} version ${latest.version}`
              : "Prepared from the published requirements, so no line is missed."
          }
        >
          {latest ? <submissionStatus.Badge status={latest.status as never} /> : null}
        </PanelHeading>

        {!latest ? (
          <div className="mt-4">
            <StartSubmissionForm tenderId={tender.id} isRevision={false} />
          </div>
        ) : (
          <>
            <ConsoleTable
              minWidth={1020}
              columns={[
                "Lot",
                "We offered",
                { label: "Quantity", numeric: true },
                { label: "Offered price", numeric: true },
                { label: "Line total", numeric: true },
                ...(showCost ? [{ label: "Unit cost", numeric: true }] : []),
                "Outcome",
              ]}
              empty={{ title: "No lines", body: "" }}
            >
              {latest.items.map((item) => (
                <Row key={item.id} className={item.isNoBid ? "opacity-55" : undefined}>
                  <td className={td}>
                    <span className="font-figures">{item.tenderItem.lotNumber || "—"}</span>
                  </td>
                  <td className={tdKey}>
                    {item.isNoBid ? (
                      <>
                        <span className="text-medi-muted">Not bid</span>
                        {item.noBidReason ? (
                          <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                            {item.noBidReason}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {item.offeredDescription}
                        {item.deviationNote ? (
                          <span className="medi-meta mt-0.5 block font-normal text-medi-warning">
                            Deviation: {item.deviationNote}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className={tdNum}>{item.isNoBid ? "—" : item.quantity}</td>
                  <td className={tdNum}>
                    {item.isNoBid ? "—" : formatPesewas(toPesewas(item.unitPrice))}
                  </td>
                  <td className={tdNum}>
                    {item.isNoBid ? "—" : formatPesewas(toPesewas(item.lineTotal))}
                  </td>
                  {showCost ? (
                    <td className={tdNum}>
                      {item.isNoBid ? "—" : formatPesewas(toPesewas(item.unitCostAtBid))}
                    </td>
                  ) : null}
                  <td className={td}>
                    <itemOutcomeStatus.Badge status={item.outcome as never} />
                    {item.awardedToOther ? (
                      <span className="medi-meta mt-0.5 block text-medi-muted">
                        to {item.awardedToOther}
                      </span>
                    ) : null}
                  </td>
                </Row>
              ))}
            </ConsoleTable>

            {latest.status === "DRAFT" ? (
              <div className="mt-6 space-y-4">
                <PanelHeading title="Price the line items" />
                {latest.items.map((item) => (
                  <PriceLineForm
                    key={item.id}
                    item={{
                      id: item.id,
                      lot: item.tenderItem.lotNumber,
                      requirement: item.tenderItem.description,
                      offeredDescription: item.offeredDescription,
                      offeredBrand: item.offeredBrand,
                      quantity: item.quantity,
                      unit: item.unit,
                      unitPrice: toPesewas(item.unitPrice),
                      unitCostAtBid: toPesewas(item.unitCostAtBid),
                      leadTimeDays: item.leadTimeDays,
                      shelfLifeMonths: item.shelfLifeMonths,
                      isNoBid: item.isNoBid,
                      deviationNote: item.deviationNote,
                    }}
                  />
                ))}
                <div className="pt-2">
                  <SubmitTenderForm submissionId={latest.id} />
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <section>
                  <PanelHeading
                    title="Record the award outcome"
                    subtitle="Per line item. A tender of many line items returns many outcomes."
                  />
                  <div className="mt-4">
                    <TenderOutcomeForm
                      submissionId={latest.id}
                      items={latest.items.map((item) => ({
                        id: item.id,
                        lot: item.tenderItem.lotNumber,
                        description: item.offeredDescription,
                        quantity: item.quantity,
                        unit: item.unit,
                        unitPrice: toPesewas(item.unitPrice),
                        isNoBid: item.isNoBid,
                        outcome: item.outcome,
                        awardedQuantity: item.awardedQuantity,
                        awardedUnitPrice: toPesewas(item.awardedUnitPrice),
                        awardedToOther: item.awardedToOther,
                      }))}
                    />
                  </div>
                </section>
                <StartSubmissionForm tenderId={tender.id} isRevision />
              </div>
            )}
          </>
        )}
      </section>

      {tender.events.length > 0 ? (
        <section>
          <PanelHeading title="Audit history" subtitle="Append-only." />
          <ul className="medi-panel mt-3 divide-y divide-medi-rule">
            {tender.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <FileText className="h-3.5 w-3.5 shrink-0 text-medi-teal-600" aria-hidden />
                <span className="text-[0.8125rem] text-medi-ink">{event.summary}</span>
                <span className="medi-meta ml-auto text-medi-muted">
                  {event.actorName} · {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <PanelHeading title="Tender details" />
        <div className="mt-4">
          <TenderForm
            tender={{ ...forForm(tender), id: tender.id }}
            organisations={organisations}
          />
        </div>
      </section>
    </div>
  );
}

/** Administrator-entered JSON. A malformed value shows nothing, never throws. */
function safeList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
