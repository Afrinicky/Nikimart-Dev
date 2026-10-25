import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * Reading what is on the shelf.
 *
 * Three questions this answers and one it refuses to:
 *
 *   what is low        free stock at or below the product's own reorder level
 *   what is expiring   batches with a date inside a window
 *   what moved         the movement log, which explains every counter
 *
 * What it will not do is compute a stock figure from the movements. The counter
 * on the product is the figure, maintained inside the same transaction as the
 * movement that changed it; deriving it here would create a second answer, and
 * two answers to "how many are there" is worse than one that can be wrong.
 */

export interface StockRow {
  id: string;
  name: string;
  sku: string;
  unitOfSale: string;
  stockOnHand: number;
  stockReserved: number;
  stockOnOrder: number;
  reorderLevel: number;
  reorderQuantity: number;
  tracksBatches: boolean;
  averageCost: Pesewas;
  free: number;
  isLow: boolean;
  value: Pesewas;
  categoryName: string;
  openBatches: number;
  soonestExpiry: Date | null;
}

export async function listStock(filters: {
  q?: string;
  filter?: string;
  categoryId?: string;
  skip?: number;
  take?: number;
}): Promise<{ rows: StockRow[]; total: number; valueShown: Pesewas }> {
  const horizon = new Date(Date.now() + 90 * 86_400_000);

  return readMedical(
    async () => {
      const where = {
        // Archived lines are excluded: they cannot be sold or bought, so
        // listing them among what has to be reordered is noise.
        status: { not: "ARCHIVED" },
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.q
          ? {
              OR: [
                { catalogueNumber: { contains: filters.q, mode: "insensitive" as const } },
                { sku: { contains: filters.q, mode: "insensitive" as const } },
                { name: { contains: filters.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(filters.filter === "expiring"
          ? {
              batches: {
                some: {
                  quantityRemaining: { gt: 0 },
                  expiryDate: { not: null, lte: horizon },
                },
              },
            }
          : {}),
        ...(filters.filter === "quarantined"
          ? { batches: { some: { isQuarantined: true, quantityRemaining: { gt: 0 } } } }
          : {}),
      };

      const all = await medicalDb.medicalProduct.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          unitOfSale: true,
          stockOnHand: true,
          stockReserved: true,
          stockOnOrder: true,
          reorderLevel: true,
          reorderQuantity: true,
          tracksBatches: true,
          averageCost: true,
          category: { select: { name: true } },
          batches: {
            where: { quantityRemaining: { gt: 0 } },
            select: { expiryDate: true },
            orderBy: { expiryDate: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });

      const mapped: StockRow[] = all.map((row) => {
        const free = row.stockOnHand - row.stockReserved;
        const cost = toPesewas(row.averageCost);
        return {
          id: row.id,
          name: row.name,
          sku: row.sku,
          unitOfSale: row.unitOfSale,
          stockOnHand: row.stockOnHand,
          stockReserved: row.stockReserved,
          stockOnOrder: row.stockOnOrder,
          reorderLevel: row.reorderLevel,
          reorderQuantity: row.reorderQuantity,
          tracksBatches: row.tracksBatches,
          averageCost: cost,
          free,
          // Only a product with a reorder point can be low. Treating zero as
          // "low at zero" would flag every line that has never been stocked.
          isLow: row.reorderLevel > 0 && free <= row.reorderLevel,
          value: row.stockOnHand * cost,
          categoryName: row.category.name,
          openBatches: row.batches.length,
          soonestExpiry: row.batches.find((b) => b.expiryDate)?.expiryDate ?? null,
        };
      });

      // `low` and `out` compare two columns to each other, which Prisma cannot
      // express in a `where`, so they are filtered here and the page is taken
      // from the filtered set — which is also where the count has to come from
      // if the pager is to be right.
      const filtered =
        filters.filter === "low"
          ? mapped.filter((row) => row.isLow)
          : filters.filter === "out"
            ? mapped.filter((row) => row.stockOnHand <= 0)
            : mapped;

      const skip = filters.skip ?? 0;
      const rows = filtered.slice(skip, skip + (filters.take ?? 25));

      return {
        rows,
        total: filtered.length,
        valueShown: rows.reduce((sum, row) => sum + row.value, 0),
      };
    },
    { rows: [], total: 0, valueShown: 0 },
  );
}

/** Headline counts for the inventory screen, over the whole catalogue. */
export async function stockSummary(): Promise<{
  lines: number;
  low: number;
  out: number;
  expiring: number;
  quarantined: number;
  value: Pesewas;
}> {
  const horizon = new Date(Date.now() + 90 * 86_400_000);

  return readMedical(
    async () => {
      const [products, expiring, quarantined] = await Promise.all([
        medicalDb.medicalProduct.findMany({
          where: { status: { not: "ARCHIVED" } },
          select: {
            stockOnHand: true,
            stockReserved: true,
            reorderLevel: true,
            averageCost: true,
          },
        }),
        medicalDb.stockBatch.count({
          where: { quantityRemaining: { gt: 0 }, expiryDate: { not: null, lte: horizon } },
        }),
        medicalDb.stockBatch.count({ where: { isQuarantined: true, quantityRemaining: { gt: 0 } } }),
      ]);

      return {
        lines: products.length,
        low: products.filter(
          (p) => p.reorderLevel > 0 && p.stockOnHand - p.stockReserved <= p.reorderLevel,
        ).length,
        out: products.filter((p) => p.stockOnHand <= 0).length,
        expiring,
        quarantined,
        value: products.reduce((sum, p) => sum + p.stockOnHand * toPesewas(p.averageCost), 0),
      };
    },
    { lines: 0, low: 0, out: 0, expiring: 0, quarantined: 0, value: 0 },
  );
}

/** One product's batches and recent movements, for the inventory detail page. */
export async function getStockDetail(productId: string) {
  return readMedical(
    () =>
      medicalDb.medicalProduct.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          sku: true,
          catalogueNumber: true,
          unitOfSale: true,
          stockOnHand: true,
          stockReserved: true,
          stockOnOrder: true,
          reorderLevel: true,
          reorderQuantity: true,
          tracksBatches: true,
          averageCost: true,
          status: true,
          category: { select: { name: true } },
          batches: {
            orderBy: [{ quantityRemaining: "desc" }, { expiryDate: "asc" }],
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              receivedAt: true,
              quantityReceived: true,
              quantityRemaining: true,
              unitCost: true,
              isQuarantined: true,
              quarantineReason: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          stockMovements: {
            orderBy: { createdAt: "desc" },
            take: 60,
            select: {
              id: true,
              kind: true,
              quantity: true,
              reservedDelta: true,
              balanceAfter: true,
              sourceType: true,
              sourceId: true,
              reason: true,
              createdAt: true,
              staff: { select: { name: true } },
              batch: { select: { batchNumber: true } },
            },
          },
        },
      }),
    null,
  );
}
