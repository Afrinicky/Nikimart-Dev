import { notFound } from "next/navigation";
import { Boxes, Snowflake, TriangleAlert } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge } from "@/components/medical/console/StatusBadge";
import { ProductForm } from "@/components/medical/console/ProductForm";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getProduct, listSuppliersForSelect } from "@/lib/medical/admin/catalogue-queries";
import { productStatus } from "@/lib/medical/admin/catalogue-status";
import { forForm } from "@/lib/medical/admin/for-form";
import { canSeeCost, canSeeSection } from "@/lib/medical/roles";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { daysUntil, formatDate, relativeDays } from "@/lib/medical/format";
import { PURCHASE_MODE_BLURBS, PURCHASE_MODE_LABELS } from "@/lib/medical/purchase-mode";

type Params = Promise<{ id: string }>;

/**
 * One product: what it is, what it costs, and what is on the shelf.
 *
 * The batches are first-expiry-first-out, in the order they will actually be
 * drawn, because that is the order the question "what goes out next" is asked
 * in — and a reagent with four months left is a different conversation from the
 * same reagent with two years.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/products");
  const { id } = await params;

  const product = await getProduct(id);
  if (!product) notFound();

  const showCost = canSeeCost(staff.role);
  const suppliers = showCost ? await listSuppliersForSelect() : [];

  const free = product.stockOnHand - product.stockReserved;
  const low = product.reorderLevel > 0 && free <= product.reorderLevel;
  const onShelf = product.batches.reduce((n, b) => n + b.quantityRemaining, 0);
  const soonest = product.batches.find((b) => b.expiryDate !== null);

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={product.name}
        subtitle={[
          product.category.name,
          product.manufacturer?.name,
          product.catalogueNumber || product.sku,
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={Boxes}
        back={{ href: "/medicals/admin/products", label: "Products" }}
      >
        <productStatus.Badge status={product.status as never} className="self-center" />
        {product.restrictedSale ? (
          <StatusBadge label="Restricted sale" tone="warn" className="self-center" />
        ) : null}
      </ConsoleHeader>

      {product.restrictedSale && product.restrictionNote ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Not sold without a check: {product.restrictionNote}
          </span>
        </p>
      ) : null}

      {product.requiresColdChain ? (
        <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-info-soft px-3.5 py-3 text-medi-info">
          <Snowflake className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Cold chain. {product.handlingNotes || `Stored ${product.storageCondition.toLowerCase()}.`}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={`${product.stockOnHand} ${product.unitOfSale}`}
          hint={`${product.stockReserved} reserved · ${product.stockOnOrder} on order`}
        />
        <StatCard
          label="Free to sell"
          value={String(free)}
          tone={low ? "attention" : "default"}
          hint={product.reorderLevel > 0 ? `Reorder at ${product.reorderLevel}` : "No reorder point set"}
        />
        <StatCard label="Listed price" value={formatPesewas(toPesewas(product.price))} />
        {showCost ? (
          <StatCard
            label="Average cost"
            value={formatPesewas(toPesewas(product.averageCost))}
            hint={`Last paid ${formatPesewas(toPesewas(product.purchaseCost))}`}
          />
        ) : null}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="medi-panel p-5">
          <PanelHeading title="Catalogue" />
          <dl className="mt-3 space-y-2.5">
            <Detail label="SKU">
              <span className="font-figures">{product.sku}</span>
            </Detail>
            <Detail label="Catalogue number">
              <span className="font-figures">{product.catalogueNumber || "Not recorded"}</span>
            </Detail>
            <Detail label="Pack size">{product.packSize || "Not stated"}</Detail>
            <Detail label="How it may be bought">
              {PURCHASE_MODE_LABELS[product.purchaseMode as keyof typeof PURCHASE_MODE_LABELS] ??
                product.purchaseMode}
            </Detail>
            <Detail label="Lead time">
              {product.leadTimeMinDays === product.leadTimeMaxDays
                ? `${product.leadTimeMaxDays} days`
                : `${product.leadTimeMinDays}–${product.leadTimeMaxDays} days`}
            </Detail>
            <Detail label="Batch tracked">{product.tracksBatches ? "Yes" : "No"}</Detail>
          </dl>
          <p className="medi-meta mt-4 text-medi-muted">
            {PURCHASE_MODE_BLURBS[product.purchaseMode as keyof typeof PURCHASE_MODE_BLURBS]}
          </p>
        </div>

        <div className="medi-panel p-5">
          <PanelHeading title={showCost ? "Sourcing" : "Where it is used"} />
          <dl className="mt-3 space-y-2.5">
            {showCost ? (
              <>
                <Detail label="Usual supplier">
                  {product.primarySupplier ? (
                    <MedicalLink
                      href={`/medicals/admin/suppliers/${product.primarySupplier.id}`}
                      className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
                    >
                      {product.primarySupplier.name}
                    </MedicalLink>
                  ) : (
                    "None chosen"
                  )}
                </Detail>
                <Detail label="Sourced">{product.sourcingMode.toLowerCase()}</Detail>
              </>
            ) : null}
            <Detail label="On quotations">{String(product._count.quotationItems)}</Detail>
            <Detail label="On sales orders">{String(product._count.salesOrderItems)}</Detail>
            <Detail label="Batches ever received">{String(product._count.batches)}</Detail>
            {soonest?.expiryDate ? (
              <Detail label="Soonest expiry">
                {formatDate(soonest.expiryDate)}
                <span className="medi-meta ml-1.5 text-medi-muted">
                  {relativeDays(soonest.expiryDate)}
                </span>
              </Detail>
            ) : null}
          </dl>
          {showCost && product.internalNotes ? (
            <p className="medi-prose mt-4 rounded-xl bg-medi-surface px-3.5 py-3 text-[0.8125rem] text-medi-body">
              {product.internalNotes}
            </p>
          ) : null}
        </div>
      </section>

      {product.tracksBatches || product.batches.length > 0 ? (
        <section>
          <PanelHeading
            title="Batches on the shelf"
            subtitle="First to expire first, which is the order they will be drawn in."
          />
          <ConsoleTable
            minWidth={showCost ? 860 : 700}
            columns={[
              "Batch",
              "Expiry",
              "Received",
              { label: "Received", numeric: true },
              { label: "Remaining", numeric: true },
              ...(showCost ? [{ label: "Unit cost", numeric: true }] : []),
              "Supplier",
            ]}
            empty={{
              title: "Nothing on the shelf",
              body: `${onShelf} units across no open batches. Stock arrives through a goods receipt.`,
            }}
          >
            {product.batches.map((batch) => {
              const days = batch.expiryDate ? daysUntil(batch.expiryDate) : null;
              return (
                <Row key={batch.id}>
                  <td className={tdKey}>
                    <span className="font-figures">{batch.batchNumber || "—"}</span>
                    {batch.isQuarantined ? (
                      <StatusBadge label="Quarantined" tone="bad" className="ml-2" />
                    ) : null}
                  </td>
                  <td className={td}>
                    {batch.expiryDate ? (
                      <>
                        {formatDate(batch.expiryDate)}
                        {days !== null && days < 0 ? (
                          <StatusBadge label="Expired" tone="bad" className="ml-2" />
                        ) : days !== null && days <= 90 ? (
                          <StatusBadge label={`${days} days`} tone="warn" className="ml-2" />
                        ) : null}
                      </>
                    ) : (
                      <span className="medi-meta text-medi-muted">No expiry</span>
                    )}
                  </td>
                  <td className={td}>{formatDate(batch.receivedAt)}</td>
                  <td className={tdNum}>{batch.quantityReceived}</td>
                  <td className={tdNum}>{batch.quantityRemaining}</td>
                  {showCost ? (
                    <td className={tdNum}>{formatPesewas(toPesewas(batch.unitCost))}</td>
                  ) : null}
                  <td className={td}>{batch.supplier?.name ?? "—"}</td>
                </Row>
              );
            })}
          </ConsoleTable>
        </section>
      ) : null}

      {showCost && product.costHistory.length > 0 ? (
        <section>
          <PanelHeading
            title="What it has cost"
            subtitle="Landed cost per unit of sale, as each delivery was received."
          />
          <ConsoleTable
            minWidth={720}
            columns={[
              "When",
              "Supplier",
              { label: "Quantity", numeric: true },
              { label: "Landed cost", numeric: true },
              "Source",
            ]}
            empty={{ title: "No history", body: "Nothing has been received yet." }}
          >
            {product.costHistory.map((entry) => (
              <Row key={entry.id}>
                <td className={tdKey}>
                  <span className="font-figures font-normal">{formatDate(entry.recordedAt)}</span>
                </td>
                <td className={td}>{entry.supplier?.name ?? "—"}</td>
                <td className={tdNum}>{entry.quantity || "—"}</td>
                <td className={tdNum}>{formatPesewas(toPesewas(entry.unitCost))}</td>
                <td className={td}>
                  <span className="medi-meta text-medi-muted">
                    {entry.source.replace(/_/g, " ").toLowerCase()}
                  </span>
                </td>
              </Row>
            ))}
          </ConsoleTable>
        </section>
      ) : null}

      {canSeeSection(staff.role, "products") ? (
        <section>
          <PanelHeading
            title="Edit"
            subtitle="Stock is not here: it moves only through a recorded movement, so the counter and the log cannot disagree."
          />
          <div className="mt-4">
            <ProductForm
              product={{ ...forForm(product), id: product.id }}
              suppliers={suppliers}
              showCost={showCost}
            />
          </div>
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
