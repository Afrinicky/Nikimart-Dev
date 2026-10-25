import { Suspense } from "react";
import { Users2 } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { AccessForm, GrantAccessForm, RoleForm } from "@/components/medical/console/StaffForms";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { MEDICAL_ROLES, MEDICAL_ROLE_LABELS } from "@/lib/medical/roles";
import { formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Who may use this console, and as what.
 *
 * Administrator only — `SECTION_ACCESS` lists no role for `staff`, which
 * `canReach` reads as closed to everybody except ADMIN. The guard is the server
 * action's own `requireMedicalRole` as well, because a form is a suggestion.
 */
export default async function StaffPage({ searchParams }: { searchParams: Search }) {
  const me = await requireMedicalStaff("/medicals/admin/staff");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const q = one(query.q);
  const role = one(query.role);
  const active = one(query.active);

  const where = {
    ...(role ? { role } : {}),
    ...(active === "0" ? { isActive: false } : active === "1" ? { isActive: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const { rows, total, counts } = await readMedical(
    async () => {
      const [rows, total, activeAdmins, suspended] = await Promise.all([
        medicalDb.medicalStaff.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            statusNote: true,
            createdAt: true,
            _count: { select: { auditLogs: true } },
          },
          orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
          skip,
          take: perPage,
        }),
        medicalDb.medicalStaff.count({ where }),
        medicalDb.medicalStaff.count({ where: { role: "ADMIN", isActive: true } }),
        medicalDb.medicalStaff.count({ where: { isActive: false } }),
      ]);
      return { rows, total, counts: { activeAdmins, suspended } };
    },
    { rows: [], total: 0, counts: { activeAdmins: 0, suspended: 0 } },
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title="Staff"
        subtitle="A role granted to an existing Nickimart account. Identity is one account across the three businesses; this decides what it may do here."
        icon={Users2}
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="With access" value={String(total)} />
        <StatCard
          label="Administrators"
          value={String(counts.activeAdmins)}
          hint="The console refuses to leave itself without one"
          tone={counts.activeAdmins === 1 ? "attention" : "default"}
        />
        <StatCard label="Suspended" value={String(counts.suspended)} />
      </div>

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch placeholder="Name or email" className="w-full sm:w-80" />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips
              name="role"
              allLabel="All roles"
              options={MEDICAL_ROLES.map((r) => ({ value: r, label: MEDICAL_ROLE_LABELS[r] }))}
            />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips
              name="active"
              allLabel="Any status"
              options={[
                { value: "1", label: "Active" },
                { value: "0", label: "Suspended" },
              ]}
            />
          </Suspense>
        </div>
      </div>

      <ConsoleTable
        minWidth={900}
        columns={["Name", "Email", "Role", "Status", "Since", "Entries in the log"]}
        empty={{
          title: "Nobody has console access",
          body: "Grant it below to an account that is already registered on Nickimart.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((person) => (
          <Row key={person.id}>
            <td className={tdKey}>
              {person.name || "—"}
              {person.id === me.staffId ? (
                <span className="medi-meta ml-1.5 font-normal text-medi-muted">you</span>
              ) : null}
            </td>
            <td className={td}>{person.email || "—"}</td>
            <td className={td}>
              {MEDICAL_ROLE_LABELS[person.role as keyof typeof MEDICAL_ROLE_LABELS] ?? person.role}
            </td>
            <td className={td}>
              {person.isActive ? (
                <StatusBadge label="Active" tone="good" />
              ) : (
                <>
                  <StatusBadge label="Suspended" tone="neutral" />
                  {person.statusNote ? (
                    <span className="medi-meta mt-1 block max-w-prose text-medi-muted">
                      {person.statusNote}
                    </span>
                  ) : null}
                </>
              )}
            </td>
            <td className={td}>{formatDate(person.createdAt)}</td>
            <td className={td}>
              <span className="font-figures">{person._count.auditLogs}</span>
            </td>
          </Row>
        ))}
      </ConsoleTable>

      {rows.length > 0 ? (
        <section>
          <PanelHeading
            title="Change access"
            subtitle="A role change takes effect on their next page load; so does a suspension."
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {rows.map((person) => (
              <div key={person.id} className="medi-panel space-y-5 p-5">
                <div>
                  <p className="text-[0.875rem] font-semibold text-medi-ink">
                    {person.name || person.email}
                  </p>
                  <p className="medi-meta text-medi-muted">{person.email}</p>
                </div>
                <RoleForm
                  staffId={person.id}
                  role={person.role}
                  name={person.name || person.email}
                />
                <div className="border-t border-medi-rule pt-5">
                  <AccessForm
                    staffId={person.id}
                    active={person.isActive}
                    name={person.name || person.email}
                    isSelf={person.id === me.staffId}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <PanelHeading title="Grant access to somebody new" />
        <div className="mt-4">
          <GrantAccessForm />
        </div>
      </section>
    </div>
  );
}
