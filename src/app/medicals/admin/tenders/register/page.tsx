import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { readPaging } from "@/lib/medical/admin/paging";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listApprovedProducts } from "@/lib/medical/tenders/queries";
import { registerStatus } from "@/lib/medical/tenders/display";
import { formatPesewas } from "@/lib/medical/money";
import { formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function ApprovedRegisterPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/tenders");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);

  const { rows, total } = await listApprovedProducts({
    q: one(query.q),
    organisationId: one(query.org),
    usableOnly: one(query.live) === "1",
    skip,
    take: perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const live = rows.filter((row) => row.state.isUsable).length;
  const lapsingSoon = rows.filter(
    (row) => row.state.isUsable && row.state.daysRemaining !== null && row.state.daysRemaining <= 60,
  ).length;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Approved product register"
        subtitle="What we are approved to supply to each institution, at what price and until when. An award is authorisation to supply — not an order, and not a sale."
        icon={BadgeCheck}
        back={{ href: "/medicals/admin/tenders", label: "Tenders" }}
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shown on this page" value={String(rows.length)} hint={`${total} in total`} />
        <StatCard label="Currently valid" value={String(live)} />
        <StatCard
          label="Expiring within 60 days"
          value={String(lapsingSoon)}
          hint="Draw them down or renew them"
          tone={lapsingSoon > 0 ? "attention" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-9 w-72" />}>
          <ConsoleSearch placeholder="Product or institution" className="w-full sm:w-80" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips
            name="live"
            allLabel="Everything"
            options={[{ value: "1", label: "Currently valid" }]}
          />
        </Suspense>
      </div>

      <ConsoleTable
        minWidth={1100}
        columns={[
          "Institution",
          "Product",
          { label: "Agreed price", numeric: true },
          { label: "Quantity drawn", numeric: true },
          "Valid",
          "State",
          "Source",
        ]}
        empty={{
          title: "Nothing approved yet",
          body: "Awarded tender lines land here automatically, with the price and the period they were awarded for. Negotiated price lists can be added here too.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((row) => (
          <Row key={row.id}>
            <td className={tdKey}>{row.organisationName}</td>
            <td className={td}>
              {row.productName}
              {row.description !== row.productName ? (
                <span className="medi-meta mt-0.5 block text-medi-muted">{row.description}</span>
              ) : null}
            </td>
            <td className={tdNum}>
              {formatPesewas(row.unitPrice)}
              <span className="medi-meta ml-1 font-normal text-medi-muted">/{row.unit}</span>
            </td>
            <td className={tdNum}>
              {row.quantityAwarded > 0 ? (
                <>
                  {row.quantityDrawn} / {row.quantityAwarded}
                  {row.state.remaining !== null ? (
                    <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                      {row.state.remaining} left
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-medi-muted">No ceiling</span>
              )}
            </td>
            <td className={td}>
              {formatDate(row.validFrom)} – {row.validUntil ? formatDate(row.validUntil) : "open"}
            </td>
            <td className={td}>
              <registerStatus.Badge status={row.state.status as never} />
              <span className="medi-meta mt-0.5 block text-medi-muted">{row.state.reason}</span>
            </td>
            <td className={td}>
              {row.tenderId && row.tenderReference ? (
                <MedicalLink
                  href={`/medicals/admin/tenders/${row.tenderId}`}
                  className="medi-focus font-figures rounded text-medi-teal-700 hover:underline"
                >
                  {row.tenderReference}
                </MedicalLink>
              ) : (
                <span className="text-medi-muted">{row.sourceKind.toLowerCase()}</span>
              )}
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}
