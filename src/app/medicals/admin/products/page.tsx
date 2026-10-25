import { Suspense } from "react";
import { Boxes } from "lucide-react";
import { ConsoleHeader, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listCategoriesForFilter, listProducts } from "@/lib/medical/admin/catalogue-queries";
import { PURCHASE_MODE_LABELS, PURCHASE_MODES } from "@/lib/medical/purchase-mode";
import { productStatus } from "@/lib/medical/admin/catalogue-status";
import { canSeeCost } from "@/lib/medical/roles";
import { formatPesewas, toPesewas } from "@/lib/medical/money";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * The catalogue, from the inside.
 *
 * Cost and supplier are columns here and nowhere a customer can reach. The
 * separation is the module this page reads from — `admin/catalogue-queries.ts`
 * rather than the storefront's `catalogue.ts` — and the role check below, which
 * leaves the cost columns out entirely for sales.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireMedicalStaff("/medicals/admin/products");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const showCost = canSeeCost(staff.role);

  const [{ rows, total }, categories] = await Promise.all([
    listProducts({
      q: one(query.q),
      status: one(query.status),
      categoryId: one(query.category),
      mode: one(query.mode),
      stock: one(query.stock),
      skip,
      take: perPage,
    }),
    listCategoriesForFilter(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // Counted from the page rather than claimed about the catalogue: a figure
  // that says "12 low" while the table shows 25 rows is a figure nobody can
  // reconcile.
  const flagged = rows.filter(
    (p) => p.reorderLevel > 0 && p.stockOnHand - p.stockReserved <= p.reorderLevel,
  ).length;
  const stockValue = rows.reduce(
    (total, p) => total + p.stockOnHand * toPesewas(p.averageCost),
    0,
  );

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Products"
        subtitle="The catalogue, with what each line costs us. Nothing on this page is reachable from the storefront."
        icon={Boxes}
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shown on this page" value={String(rows.length)} hint={`${total} match`} />
        <StatCard
          label="At or below reorder level"
          value={String(flagged)}
          tone={flagged > 0 ? "attention" : "default"}
          hint="On this page"
        />
        {showCost ? (
          <StatCard
            label="Stock value on this page"
            value={formatPesewas(stockValue)}
            hint="On-hand units at average cost"
          />
        ) : null}
      </div>

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Catalogue number, SKU or name"
            className="w-full sm:w-96"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips name="status" options={productStatus.options} />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips
              name="stock"
              allLabel="Any stock"
              options={[
                { value: "low", label: "At reorder level" },
                { value: "out", label: "Nothing on hand" },
              ]}
            />
          </Suspense>
          <Suspense fallback={null}>
            <FilterChips
              name="mode"
              allLabel="Any purchase mode"
              options={PURCHASE_MODES.map((m) => ({ value: m, label: PURCHASE_MODE_LABELS[m] }))}
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
        minWidth={showCost ? 1080 : 920}
        columns={[
          "Product",
          "Department",
          "Status",
          "How it is bought",
          { label: "On hand", numeric: true },
          { label: "Free", numeric: true },
          { label: "Price", numeric: true },
          ...(showCost ? [{ label: "Cost", numeric: true }] : []),
        ]}
        empty={{
          title: "No products match",
          body: "Clear the filters, or seed the catalogue with npm run medical:seed.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((product) => {
          const free = product.stockOnHand - product.stockReserved;
          const low = product.reorderLevel > 0 && free <= product.reorderLevel;
          return (
            <Row key={product.id}>
              <td className={tdKey}>
                <MedicalLink
                  href={`/medicals/admin/products/${product.id}`}
                  className="medi-focus rounded hover:text-medi-teal-700"
                >
                  {product.name}
                </MedicalLink>
                <span className="medi-meta mt-0.5 block font-normal text-medi-muted">
                  <span className="font-figures">{product.catalogueNumber || product.sku}</span>
                  {product.restrictedSale ? (
                    <StatusBadge label="Restricted" tone="warn" className="ml-2" />
                  ) : null}
                </span>
              </td>
              <td className={td}>{product.category.name}</td>
              <td className={td}>
                <productStatus.Badge status={product.status as never} />
              </td>
              <td className={td}>
                {PURCHASE_MODE_LABELS[
                  product.purchaseMode as keyof typeof PURCHASE_MODE_LABELS
                ] ?? product.purchaseMode}
              </td>
              <td className={tdNum}>
                {product.stockOnHand}
                {product.stockOnOrder > 0 ? (
                  <span className="medi-meta ml-1.5 font-normal text-medi-muted">
                    +{product.stockOnOrder} due
                  </span>
                ) : null}
              </td>
              <td className={tdNum}>
                {low ? <span className="text-medi-warning">{free}</span> : free}
              </td>
              <td className={tdNum}>{formatPesewas(toPesewas(product.price))}</td>
              {showCost ? (
                <td className={tdNum}>
                  {toPesewas(product.averageCost) > 0
                    ? formatPesewas(toPesewas(product.averageCost))
                    : formatPesewas(toPesewas(product.purchaseCost))}
                </td>
              ) : null}
            </Row>
          );
        })}
      </ConsoleTable>
    </div>
  );
}
