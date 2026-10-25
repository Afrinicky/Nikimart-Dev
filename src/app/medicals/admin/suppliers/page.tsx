import { Plus, Users } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSuppliers } from "@/lib/medical/procurement/queries";
import { Suspense } from "react";

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function SuppliersPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/suppliers");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listSuppliers({
    q: one(query.q),
    kind: one(query.kind),
    active: one(query.active),
    skip,
    take: perPage,
  });

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Suppliers"
        subtitle="Suppliers we purchase from, local and international. An internal record: none of it reaches the storefront."
        icon={Users}
      >
        <MedicalButtonLink href="/medicals/admin/suppliers/new" size="sm">
          <Plus className="h-4 w-4" aria-hidden />
          Add a supplier
        </MedicalButtonLink>
      </ConsoleHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Name, code, contact or email" className="w-full sm:w-72" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips
            name="kind"
            options={[
              { value: "LOCAL", label: "Local" },
              { value: "INTERNATIONAL", label: "International" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips
            name="active"
            allLabel="Any status"
            options={[
              { value: "1", label: "Active" },
              { value: "0", label: "Inactive" },
            ]}
          />
        </Suspense>
      </div>

      <ConsoleTable
        columns={[
          "Supplier",
          "Code",
          "Where",
          "Currency",
          { label: "Lead time", numeric: true },
          { label: "Payment terms", numeric: true },
          { label: "Purchase orders", numeric: true },
          "Status",
        ]}
        empty={{
          title: "No suppliers yet",
          body: "Add the people you buy from. Their prices, lead times and payment terms live here and never reach a customer.",
          action: (
            <MedicalButtonLink href="/medicals/admin/suppliers/new" size="sm">
              Add a supplier
            </MedicalButtonLink>
          ),
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((supplier) => (
          <Row key={supplier.id}>
            <td className={tdKey}>
              <MedicalLink
                href={`/medicals/admin/suppliers/${supplier.id}`}
                className="medi-focus rounded hover:text-medi-teal-700"
              >
                {supplier.name}
              </MedicalLink>
              {supplier.contactName ? (
                <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                  {supplier.contactName}
                </span>
              ) : null}
            </td>
            <td className={td}>
              <span className="font-figures">{supplier.code}</span>
            </td>
            <td className={td}>
              {supplier.country}
              <span className="medi-meta mt-0.5 block text-medi-muted">
                {supplier.kind === "INTERNATIONAL" ? "International" : "Local"}
              </span>
            </td>
            <td className={td}>{supplier.currency}</td>
            <td className={tdNum}>{supplier.leadTimeDays}d</td>
            <td className={tdNum}>
              {supplier.paymentTermsDays > 0 ? `${supplier.paymentTermsDays}d` : "On order"}
            </td>
            <td className={tdNum}>{supplier._count.purchaseOrders}</td>
            <td className={td}>
              <StatusBadge
                label={supplier.isActive ? "Active" : "Inactive"}
                tone={supplier.isActive ? "good" : "neutral"}
              />
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}
