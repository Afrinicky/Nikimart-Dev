import { Suspense } from "react";
import { Gavel, Plus } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listTenders } from "@/lib/medical/tenders/queries";
import { tenderStatus } from "@/lib/medical/tenders/display";
import { deadlinePressure } from "@/lib/medical/tenders/status";
import { formatPesewasShort, toPesewas } from "@/lib/medical/money";
import { formatDate, relativeDays } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function TendersPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/tenders");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listTenders({
    q: one(query.q),
    status: one(query.status),
    skip,
    take: perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const live = rows.filter((t) =>
    ["IDENTIFIED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION"].includes(t.status),
  );
  const critical = rows.filter(
    (t) => deadlinePressure(t.submissionDeadline) === "critical",
  ).length;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Tenders"
        subtitle="Institutional procurement exercises. A tender has many line items and many outcomes — it is not won or lost as a whole."
        icon={Gavel}
      >
        <MedicalButtonLink href="/medicals/admin/tenders/register" variant="secondary" size="sm">
          Approved register
        </MedicalButtonLink>
        <MedicalButtonLink href="/medicals/admin/tenders/new" size="sm">
          <Plus className="h-4 w-4" aria-hidden />
          Record a tender
        </MedicalButtonLink>
      </ConsoleHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shown on this page" value={String(rows.length)} hint={`${total} in total`} />
        <StatCard label="Open" value={String(live.length)} hint="Not yet decided" />
        <StatCard
          label="Deadline within 7 days"
          value={String(critical)}
          tone={critical > 0 ? "attention" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Reference, their number, title or institution" className="w-full sm:w-80" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="status" options={tenderStatus.options} />
        </Suspense>
      </div>

      <ConsoleTable
        minWidth={1040}
        columns={[
          "Reference",
          "Institution",
          "Title",
          "Status",
          "Deadline",
          { label: "Line items", numeric: true },
          { label: "Estimated value", numeric: true },
          "Renewal",
        ]}
        empty={{
          title: "No tenders recorded",
          body: "Record a hospital's procurement exercise, its published requirements and its dates. The outcome is kept per line, because a tender of forty lines comes back with several different answers.",
          action: (
            <MedicalButtonLink href="/medicals/admin/tenders/new" size="sm">
              Record a tender
            </MedicalButtonLink>
          ),
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((tender) => {
          const pressure = deadlinePressure(tender.submissionDeadline);
          return (
            <Row key={tender.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/tenders/${tender.id}`}
                  className="medi-focus font-figures rounded hover:text-medi-teal-700"
                >
                  {tender.reference}
                </MedicalLink>
                {tender.tenderNumber ? (
                  <span className="medi-meta font-figures mt-0.5 block font-normal text-medi-muted">
                    {tender.tenderNumber}
                  </span>
                ) : null}
              </td>
              <td className={td}>{tender.organisation.name}</td>
              <td className={td}>
                <span className="line-clamp-2">{tender.title}</span>
                {tender.cycle ? (
                  <span className="medi-meta mt-0.5 block text-medi-muted">{tender.cycle}</span>
                ) : null}
              </td>
              <td className={td}>
                <tenderStatus.Badge status={tender.status as never} />
              </td>
              <td className={td}>
                {formatDate(tender.submissionDeadline)}
                {pressure === "critical" || pressure === "passed" ? (
                  <StatusBadge
                    label={
                      pressure === "passed"
                        ? "Passed"
                        : tender.submissionDeadline
                          ? relativeDays(tender.submissionDeadline)
                          : ""
                    }
                    tone={pressure === "passed" ? "neutral" : "bad"}
                    className="ml-2 align-middle"
                  />
                ) : null}
              </td>
              <td className={tdNum}>{tender._count.items}</td>
              <td className={tdNum}>
                {toPesewas(tender.estimatedValue) > 0 ? (
                  <>
                    {formatPesewasShort(toPesewas(tender.estimatedValue))}
                    <span className="medi-meta ml-1 font-normal text-medi-muted">est.</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={td}>{formatDate(tender.renewalDueAt)}</td>
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
