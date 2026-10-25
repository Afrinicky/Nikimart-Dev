import { notFound } from "next/navigation";
import { Warehouse } from "lucide-react";
import { ConsoleHeader, PanelHeading, StatCard } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey, tdNum } from "@/components/medical/console/ConsoleTable";
import { StatusBadge, type Tone } from "@/components/medical/console/StatusBadge";
import {
  QuarantineForm,
  ReorderPointForm,
  StockAdjustmentForm,
} from "@/components/medical/console/InventoryForms";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { requireMedicalStaff } from "@/lib/medical/session";
import { getStockDetail } from "@/lib/medical/inventory/queries";
import { canSeeCost, canSeeSection } from "@/lib/medical/roles";
import { formatPesewas, toPesewas } from "@/lib/medical/money";
import { daysUntil, formatDate, formatDateTime } from "@/lib/medical/format";

type Params = Promise<{ id: string }>;

/**
 * One product's stock: the batches it sits in, and the log that explains the
 * counter.
 *
 * The movement log is the point of this page. A stock figure nobody can explain
 * is a stock figure nobody acts on, so every row says what moved it, by how
 * much, and what the counter read afterwards — stored at the time rather than
 * summed here, so a disagreement between the log and the counter is visible at
 * the row where it began.
 */
export default async function InventoryDetailPage({ params }: { params: Params }) {
  const staff = await requireMedicalStaff("/medicals/admin/inventory");
  const { id } = await params;

  const product = await getStockDetail(id);
  if (!product) notFound();

  const showCost = canSeeCost(staff.role);
  const canAdjust = canSeeSection(staff.role, "inventory");

  const free = product.stockOnHand - product.stockReserved;
  const low = product.reorderLevel > 0 && free <= product.reorderLevel;
  const open = product.batches.filter((b) => b.quantityRemaining > 0);
  const held = open.filter((b) => b.isQuarantined);
  const sellable = open
    .filter((b) => !b.isQuarantined)
    .reduce((n, b) => n + b.quantityRemaining, 0);
  const value = open.reduce((n, b) => n + b.quantityRemaining * toPesewas(b.unitCost), 0);

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title={product.name}
        subtitle={`${product.category.name} · ${product.catalogueNumber || product.sku}`}
        icon={Warehouse}
        back={{ href: "/medicals/admin/inventory", label: "Inventory" }}
      >
        <MedicalLink
          href={`/medicals/admin/products/${product.id}`}
          className="medi-focus medi-meta self-center rounded font-semibold text-medi-teal-700 hover:underline"
        >
          Catalogue record
        </MedicalLink>
      </ConsoleHeader>

      {held.length > 0 ? (
        <p className="medi-meta rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
          {held.reduce((n, b) => n + b.quantityRemaining, 0)} units across{" "}
          {held.length} batch{held.length === 1 ? "" : "es"} are held back from sale. They are in the
          valuation below and not in what can be sold.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={`${product.stockOnHand} ${product.unitOfSale}`}
          hint={`${product.stockReserved} reserved`}
        />
        <StatCard
          label="Free to sell"
          value={String(Math.min(free, sellable))}
          tone={low ? "attention" : "default"}
          hint={
            product.reorderLevel > 0
              ? `Reorder at ${product.reorderLevel}`
              : "No reorder point set"
          }
        />
        <StatCard
          label="On order"
          value={String(product.stockOnOrder)}
          hint="On an approved purchase order"
        />
        {showCost ? (
          <StatCard
            label="Value on the shelf"
            value={formatPesewas(value)}
            hint={`Average ${formatPesewas(toPesewas(product.averageCost))} a unit`}
          />
        ) : null}
      </div>

      <section>
        <PanelHeading
          title="Batches"
          subtitle={
            product.tracksBatches
              ? "Everything ever received, open batches first then by expiry."
              : "This product is not tracked by batch, so a receipt creates one unbatched lot."
          }
        />
        <ConsoleTable
          minWidth={showCost ? 940 : 800}
          columns={[
            "Batch",
            "Expiry",
            "Received",
            { label: "Received", numeric: true },
            { label: "Remaining", numeric: true },
            ...(showCost ? [{ label: "Unit cost", numeric: true }] : []),
            "Supplier",
            "Status",
          ]}
          empty={{
            title: "No batches",
            body: "Stock arrives through a goods receipt against a purchase order.",
          }}
        >
          {product.batches.map((batch) => {
            const days = batch.expiryDate ? daysUntil(batch.expiryDate) : null;
            return (
              <Row key={batch.id}>
                <td className={tdKey}>
                  <span className="font-figures">{batch.batchNumber || batch.id.slice(-6)}</span>
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
                <td className={tdNum}>
                  {batch.quantityRemaining === 0 ? (
                    <span className="text-medi-muted">0</span>
                  ) : (
                    batch.quantityRemaining
                  )}
                </td>
                {showCost ? (
                  <td className={tdNum}>{formatPesewas(toPesewas(batch.unitCost))}</td>
                ) : null}
                <td className={td}>{batch.supplier?.name ?? "—"}</td>
                <td className={td}>
                  {batch.isQuarantined ? (
                    <>
                      <StatusBadge label="Held" tone="bad" />
                      {batch.quarantineReason ? (
                        <span className="medi-meta mt-1 block max-w-prose text-medi-muted">
                          {batch.quarantineReason}
                        </span>
                      ) : null}
                    </>
                  ) : batch.quantityRemaining > 0 ? (
                    <StatusBadge label="Sellable" tone="good" />
                  ) : (
                    <span className="medi-meta text-medi-muted">Drawn down</span>
                  )}
                </td>
              </Row>
            );
          })}
        </ConsoleTable>
      </section>

      <section>
        <PanelHeading
          title="Movement log"
          subtitle="Every change to the counter, with what it read afterwards. The last sixty."
        />
        <ConsoleTable
          minWidth={860}
          columns={[
            "When",
            "What",
            { label: "Units", numeric: true },
            { label: "Reserved", numeric: true },
            { label: "Counter after", numeric: true },
            "Batch",
            "Why",
          ]}
          empty={{
            title: "Nothing has moved",
            body: "The counter has never changed, which means it reads zero.",
          }}
        >
          {product.stockMovements.map((move) => (
            <Row key={move.id}>
              <td className={tdKey}>
                <span className="font-figures font-normal">{formatDateTime(move.createdAt)}</span>
              </td>
              <td className={td}>
                <StatusBadge label={moveLabel(move.kind)} tone={moveTone(move.kind)} />
              </td>
              <td className={tdNum}>
                {move.quantity === 0 ? (
                  <span className="text-medi-muted">—</span>
                ) : (
                  <span className={move.quantity < 0 ? "text-medi-danger" : "text-medi-success"}>
                    {move.quantity > 0 ? "+" : ""}
                    {move.quantity}
                  </span>
                )}
              </td>
              <td className={tdNum}>
                {move.reservedDelta === 0 ? (
                  <span className="text-medi-muted">—</span>
                ) : (
                  `${move.reservedDelta > 0 ? "+" : ""}${move.reservedDelta}`
                )}
              </td>
              <td className={tdNum}>{move.balanceAfter}</td>
              <td className={td}>
                <span className="font-figures medi-meta text-medi-muted">
                  {move.batch?.batchNumber || "—"}
                </span>
              </td>
              <td className={td}>
                <span className="medi-prose block max-w-prose">{move.reason || "—"}</span>
                {move.staff?.name ? (
                  <span className="medi-meta mt-0.5 block text-medi-muted">{move.staff.name}</span>
                ) : null}
              </td>
            </Row>
          ))}
        </ConsoleTable>
      </section>

      {canAdjust ? (
        <>
          <section>
            <PanelHeading
              title="Reorder point"
              subtitle="What counts as low for this line, and what to buy when it is."
            />
            <div className="mt-4">
              <ReorderPointForm
                productId={product.id}
                reorderLevel={product.reorderLevel}
                reorderQuantity={product.reorderQuantity}
                unitOfSale={product.unitOfSale}
              />
            </div>
          </section>

          <section>
            <PanelHeading
              title="Correct the figure"
              subtitle="A count, a breakage, an expiry. Every adjustment keeps its reason."
            />
            <div className="mt-4">
              <StockAdjustmentForm
                productId={product.id}
                unitOfSale={product.unitOfSale}
                onHand={product.stockOnHand}
                batches={open.map((b) => ({
                  id: b.id,
                  batchNumber: b.batchNumber,
                  expiryDate: b.expiryDate,
                  remaining: b.quantityRemaining,
                }))}
              />
            </div>
          </section>

          {open.length > 0 ? (
            <section>
              <PanelHeading
                title="Hold a batch back"
                subtitle="A recall, damage, a certificate that has not arrived. Nothing moves — only whether it may be sold."
              />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {open.map((batch) => (
                  <div key={batch.id} className="medi-panel p-5">
                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-figures text-[0.875rem] font-semibold text-medi-ink">
                        {batch.batchNumber || batch.id.slice(-6)}
                      </p>
                      <p className="medi-meta text-medi-muted">
                        {batch.quantityRemaining} left
                        {batch.expiryDate ? ` · expires ${formatDate(batch.expiryDate)}` : ""}
                      </p>
                    </div>
                    <QuarantineForm
                      batchId={batch.id}
                      batchNumber={batch.batchNumber}
                      quarantined={batch.isQuarantined}
                      remaining={batch.quantityRemaining}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const MOVE_TONES: Record<string, Tone> = {
  RECEIPT: "good",
  OPENING: "neutral",
  RETURN: "good",
  SALE: "progress",
  POS_SALE: "progress",
  DISPATCH: "progress",
  RESERVATION: "info",
  RELEASE: "info",
  TRANSFER: "neutral",
  ADJUSTMENT: "warn",
  DAMAGE: "bad",
  EXPIRY: "bad",
};

const MOVE_LABELS: Record<string, string> = {
  RECEIPT: "Received",
  OPENING: "Opening",
  RETURN: "Returned",
  SALE: "Sold",
  POS_SALE: "Counter sale",
  DISPATCH: "Dispatched",
  RESERVATION: "Reserved",
  RELEASE: "Released",
  TRANSFER: "Transferred",
  ADJUSTMENT: "Adjusted",
  DAMAGE: "Damaged",
  EXPIRY: "Expired",
};

const moveTone = (kind: string): Tone => MOVE_TONES[kind] ?? "neutral";
const moveLabel = (kind: string): string => MOVE_LABELS[kind] ?? kind.toLowerCase();
