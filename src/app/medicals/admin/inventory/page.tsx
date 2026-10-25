import { Suspense } from "react";
import { Warehouse } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listStock, stockSummary } from "@/lib/medical/inventory/queries";
import { listCategoriesForFilter } from "@/lib/medical/admin/catalogue-queries";
import { canSeeCost } from "@/lib/medical/roles";
import { formatPesewas } from "@/lib/medical/money";
import { daysUntil, formatDate } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * What is on the shelf, and what needs doing about it.
 *
 * The filters here are the ones the overview tiles link to, which is why
 * `?filter=low` and `?filter=expiring` are part of this page's contract rather
 * than a convenience: a tile that promises a filtered list has to land on one.
 *
 * Low is measured against each product's own reorder level, not a global
 * threshold. A reagent that turns over weekly and an analyser sold twice a year
 * do not share a sensible number, and a single setting would flag one of them
 * permanently and the other never.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireMedicalStaff("/medicals/admin/inventory");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const showCost = canSeeCost(staff.role);
  const filter = one(query.filter);

  const [{ rows, total, valueShown }, summary, categories] = await Promise.all([
    listStock({
      q: one(query.q),
      filter,
      categoryId: one(query.category),
      skip,
      take: perPage,
    }),
    stockSummary(),
    listCategoriesForFilter(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Inventory"
        subtitle="Counters, batches and what has to be reordered. Every figure here is explained by a movement."
        icon={Warehouse}
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="At or below reorder level"
          value={String(summary.low)}
          tone={summary.low > 0 ? "attention" : "default"}
          href="/medicals/admin/inventory?filter=low"
        />
        <StatCard
          label="Nothing on hand"
          value={String(summary.out)}
          href="/medicals/admin/inventory?filter=out"
        />
        <StatCard
          label="Batches expiring in 90 days"
          value={String(summary.expiring)}
          tone={summary.expiring > 0 ? "attention" : "default"}
          href="/medicals/admin/inventory?filter=expiring"
        />
        {showCost ? (
          <StatCard
            label="Stock value"
            value={formatPesewas(summary.value)}
            hint={`${summary.lines} lines at average cost`}
          />
        ) : (
          <StatCard label="Lines stocked" value={String(summary.lines)} />
        )}
      </div>

      {summary.quarantined > 0 ? (
        <p className="medi-meta rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
          {summary.quarantined} batch{summary.quarantined === 1 ? "" : "es"} held back from sale.
          Held stock stays in the valuation — the money is tied up in it — and leaves availability.{" "}
          <MedicalLink
            href="/medicals/admin/inventory?filter=quarantined"
            className="medi-focus rounded font-semibold underline"
          >
            Show them
          </MedicalLink>
        </p>
      ) : null}

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch placeholder="Catalogue number, SKU or name" className="w-full sm:w-96" />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips
              name="filter"
              allLabel="Everything"
              options={[
                { value: "low", label: "At reorder level" },
                { value: "out", label: "Nothing on hand" },
                { value: "expiring", label: "Expiring soon" },
                { value: "quarantined", label: "Held back" },
              ]}
            />
          </Suspense>
        </div>
        {categories.length > 0 ? (
          <Suspense fallback={null}>
            <FilterChips name="category" options={categories} allLabel="All departments" />
          </Suspense>
        ) : null}
      </div>

      <ConsoleTable
        minWidth={showCost ? 1020 : 880}
        columns={[
          "Product",
          "Department",
          { label: "On hand", numeric: true },
          { label: "Reserved", numeric: true },
          { label: "Free", numeric: true },
          { label: "On order", numeric: true },
          "Soonest expiry",
          ...(showCost ? [{ label: "Value", numeric: true }] : []),
        ]}
        empty={{
          title: filter ? "Nothing matches that filter" : "Nothing stocked yet",
          body: filter
            ? "Which is the answer you want. Clear the filter to see the rest."
            : "Stock arrives through a goods receipt against a purchase order.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((row) => {
          const days = row.soonestExpiry ? daysUntil(row.soonestExpiry) : null;
          return (
            <Row key={row.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/inventory/${row.id}`}
                  className="medi-focus rounded hover:text-medi-teal-700"
                >
                  {row.name}
                </MedicalLink>
                <span className="medi-meta font-figures mt-0.5 block font-normal text-medi-muted">
                  {row.sku}
                </span>
              </td>
              <td className={td}>{row.categoryName}</td>
              <td className={tdNum}>{row.stockOnHand}</td>
              <td className={tdNum}>
                {row.stockReserved > 0 ? row.stockReserved : <span className="text-medi-muted">—</span>}
              </td>
              <td className={tdNum}>
                {row.isLow ? (
                  <span className="text-medi-warning">{row.free}</span>
                ) : (
                  row.free
                )}
                {row.isLow ? (
                  <span className="medi-meta ml-1.5 font-normal text-medi-muted">
                    of {row.reorderLevel}
                  </span>
                ) : null}
              </td>
              <td className={tdNum}>
                {row.stockOnOrder > 0 ? row.stockOnOrder : <span className="text-medi-muted">—</span>}
              </td>
              <td className={td}>
                {row.soonestExpiry === null ? (
                  <span className="medi-meta text-medi-muted">
                    {row.tracksBatches ? "No open batch" : "Not tracked"}
                  </span>
                ) : days !== null && days < 0 ? (
                  <StatusBadge label="Expired" tone="bad" />
                ) : days !== null && days <= 90 ? (
                  <StatusBadge label={`${days} days`} tone="warn" />
                ) : (
                  formatDate(row.soonestExpiry)
                )}
              </td>
              {showCost ? <td className={tdNum}>{formatPesewas(row.value)}</td> : null}
            </Row>
          );
        })}
      </ConsoleTable>

      {showCost && rows.length > 0 ? (
        <p className="medi-meta text-right text-medi-muted">
          Shown on this page: <span className="font-figures">{formatPesewas(valueShown)}</span>
        </p>
      ) : null}
    </div>
  );
}
