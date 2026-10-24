import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { InstitutionForm } from "@/components/medical/console/InstitutionForm";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { forForm } from "@/lib/medical/admin/for-form";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { listApprovedProducts } from "@/lib/medical/tenders/queries";
import { registerStatus, tenderStatus } from "@/lib/medical/tenders/display";
import { formatPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";

type Params = Promise<{ id: string }>;

export default async function InstitutionPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/institutions");
  const { id } = await params;

  const [institution, register] = await Promise.all([
    readMedical(
      () =>
        medicalDb.organisation.findUnique({
          where: { id },
          include: {
            tenders: {
              select: {
                id: true,
                reference: true,
                title: true,
                status: true,
                submissionDeadline: true,
                renewalDueAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        }),
      null,
    ),
    listApprovedProducts({ organisationId: id, take: 50 }),
  ]);
  if (!institution) notFound();

  const usable = register.rows.filter((row) => row.state.isUsable).length;

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={institution.name}
        subtitle={[institution.kind.toLowerCase(), institution.city, institution.region]
          .filter(Boolean)
          .join(" · ")}
        icon={Building2}
        back={{ href: "/medicals/admin/institutions", label: "Institutions" }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tenders" value={String(institution.tenders.length)} />
        <StatCard label="Approved lines" value={String(register.rows.length)} />
        <StatCard label="Usable today" value={String(usable)} />
        <StatCard
          label="Credit"
          value={institution.creditApproved ? "Approved" : "Not approved"}
          hint={
            institution.creditApproved ? `Limit ${formatPesewas(Number(institution.creditLimit) * 100)}` : undefined
          }
        />
      </div>

      <section>
        <PanelHeading
          title="Approved product register"
          subtitle="What we are approved to supply to this institution, at what price and until when. An award is authorisation to supply, not an order."
        >
          <MedicalLink
            href={`/medicals/admin/tenders/register?org=${institution.id}`}
            className="medi-focus medi-meta rounded font-semibold text-medi-teal-700 hover:underline"
          >
            Full register
          </MedicalLink>
        </PanelHeading>
        <ConsoleTable
          minWidth={820}
          columns={[
            "Product",
            { label: "Agreed price", numeric: true },
            { label: "Quantity drawn", numeric: true },
            "Valid until",
            "State",
          ]}
          empty={{
            title: "Nothing approved",
            body: "Awarded tender lines appear here with the price and period they were awarded for.",
          }}
        >
          {register.rows.map((row) => (
            <Row key={row.id}>
              <td className={tdKey}>{row.productName}</td>
              <td className={tdNum}>
                {formatPesewas(row.unitPrice)}
                <span className="medi-meta ml-1 font-normal text-medi-muted">/{row.unit}</span>
              </td>
              <td className={tdNum}>
                {row.quantityAwarded > 0 ? `${row.quantityDrawn} / ${row.quantityAwarded}` : "—"}
              </td>
              <td className={td}>{row.validUntil ? formatDate(row.validUntil) : "open"}</td>
              <td className={td}>
                <registerStatus.Badge status={row.state.status as never} />
              </td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      <section>
        <PanelHeading title="Tenders" />
        <ConsoleTable
          minWidth={760}
          columns={["Reference", "Title", "Status", "Deadline", "Renewal"]}
          empty={{ title: "No tenders", body: "No procurement exercises recorded for them yet." }}
        >
          {institution.tenders.map((tender) => (
            <Row key={tender.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/tenders/${tender.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {tender.reference}
                </MedicalLink>
              </td>
              <td className={td}>{tender.title}</td>
              <td className={td}>
                <tenderStatus.Badge status={tender.status as never} />
              </td>
              <td className={td}>{formatDate(tender.submissionDeadline)}</td>
              <td className={td}>{formatDate(tender.renewalDueAt)}</td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      <section>
        <PanelHeading title="Institution details" />
        <div className="mt-4">
          <InstitutionForm
            institution={{ ...forForm(institution), id: institution.id }}
            canSetCredit={["ADMIN", "MANAGER", "FINANCE"].includes(staff.role)}
          />
        </div>
      </section>
    </div>
  );
}
