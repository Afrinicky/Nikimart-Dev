import { Suspense } from "react";
import { Building2, Plus } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

const KINDS = [
  { value: "HOSPITAL", label: "Hospitals" },
  { value: "LABORATORY", label: "Laboratories" },
  { value: "CLINIC", label: "Clinics" },
  { value: "PHARMACY", label: "Pharmacies" },
  { value: "RESEARCH", label: "Research" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "GOVERNMENT", label: "Government" },
];

export default async function InstitutionsPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/institutions");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const q = one(query.q);
  const kind = one(query.kind);

  const where = {
    ...(kind ? { kind } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const { rows, total } = await readMedical(
    async () => {
      const [rows, total] = await Promise.all([
        medicalDb.organisation.findMany({
          where,
          select: {
            id: true,
            name: true,
            kind: true,
            city: true,
            region: true,
            email: true,
            phone: true,
            isVerified: true,
            creditApproved: true,
            isActive: true,
            _count: {
              select: { tenders: true, approvedProducts: true, salesOrders: true },
            },
          },
          orderBy: { name: "asc" },
          skip,
          take: perPage,
        }),
        medicalDb.organisation.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 },
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Institutions"
        subtitle="Hospitals, laboratories and clinics that purchase from us. Tenders, approved prices and sales orders are all held against these records."
        icon={Building2}
      >
        <MedicalButtonLink href="/medicals/admin/institutions/new" size="sm">
          <Plus className="h-4 w-4" aria-hidden />
          Add an institution
        </MedicalButtonLink>
      </ConsoleHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Name, city or email" className="w-full sm:w-72" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips name="kind" options={KINDS} />
        </Suspense>
      </div>

      <ConsoleTable
        minWidth={900}
        columns={[
          "Institution",
          "Kind",
          "Where",
          "Contact",
          { label: "Tenders", numeric: true },
          { label: "Approved products", numeric: true },
          "Credit",
        ]}
        empty={{
          title: "No institutions yet",
          body: "Add the hospitals and laboratories you supply. A tender belongs to the institution running it, and the approved-product register is kept per institution.",
          action: (
            <MedicalButtonLink href="/medicals/admin/institutions/new" size="sm">
              Add an institution
            </MedicalButtonLink>
          ),
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((org) => (
          <Row key={org.id}>
            <td className={tdKey}>
              <MedicalLink
                href={`/medicals/admin/institutions/${org.id}`}
                className="medi-focus rounded hover:text-medi-teal-700"
              >
                {org.name}
              </MedicalLink>
            </td>
            <td className={td}>
              <span className="capitalize">{org.kind.toLowerCase()}</span>
            </td>
            <td className={td}>{[org.city, org.region].filter(Boolean).join(", ") || "—"}</td>
            <td className={td}>
              {org.email || org.phone || "—"}
            </td>
            <td className={tdNum}>{org._count.tenders}</td>
            <td className={tdNum}>{org._count.approvedProducts}</td>
            <td className={td}>
              <StatusBadge
                label={org.creditApproved ? "Approved" : "Not approved"}
                tone={org.creditApproved ? "good" : "neutral"}
              />
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}
