import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * Reading the catalogue from inside the console.
 *
 * Distinct from `lib/medical/catalogue.ts`, which serves the storefront and
 * names every public column explicitly so a cost can never reach a customer.
 * This one is allowed the private columns — purchase cost, average cost,
 * supplier, internal notes — and is therefore never imported by a storefront
 * route. The boundary is the module, not a flag on a query.
 */

export interface ProductListFilters {
  q?: string;
  status?: string;
  categoryId?: string;
  mode?: string;
  stock?: string;
  skip?: number;
  take?: number;
}

export async function listProducts(filters: ProductListFilters) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.mode ? { purchaseMode: filters.mode } : {}),
    // Out of stock is the physical counter at zero; low is at or below the
    // product's own reorder level, which is the only threshold that means
    // anything per product.
    ...(filters.stock === "out" ? { stockOnHand: { lte: 0 } } : {}),
    ...(filters.q
      ? {
          OR: [
            // Catalogue number first, because a laboratory orders
            // "Roche 04489357190" and not "glucose reagent".
            { catalogueNumber: { contains: filters.q, mode: "insensitive" as const } },
            { sku: { contains: filters.q, mode: "insensitive" as const } },
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { searchTerms: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return readMedical(
    async () => {
      const [all, total] = await Promise.all([
        medicalDb.medicalProduct.findMany({
          where,
          select: {
            id: true,
            slug: true,
            name: true,
            sku: true,
            catalogueNumber: true,
            status: true,
            purchaseMode: true,
            price: true,
            purchaseCost: true,
            averageCost: true,
            stockOnHand: true,
            stockReserved: true,
            stockOnOrder: true,
            reorderLevel: true,
            tracksBatches: true,
            restrictedSale: true,
            unitOfSale: true,
            category: { select: { id: true, name: true } },
            primarySupplier: { select: { id: true, name: true } },
          },
          orderBy: [{ status: "asc" }, { name: "asc" }],
          // `low` cannot be expressed in SQL against another column through
          // Prisma, so it is filtered after the read and the page is taken from
          // the filtered set. Only correct because this is a console list with
          // a bounded page, and it is why the count comes from the same array.
          ...(filters.stock === "low" ? {} : { skip: filters.skip ?? 0, take: filters.take ?? 25 }),
        }),
        medicalDb.medicalProduct.count({ where }),
      ]);

      if (filters.stock !== "low") return { rows: all, total };

      const low = all.filter(
        (p) => p.reorderLevel > 0 && p.stockOnHand - p.stockReserved <= p.reorderLevel,
      );
      const skip = filters.skip ?? 0;
      return { rows: low.slice(skip, skip + (filters.take ?? 25)), total: low.length };
    },
    { rows: [], total: 0 },
  );
}

export async function getProduct(id: string) {
  return readMedical(
    () =>
      medicalDb.medicalProduct.findUnique({
        where: { id },
        include: {
          category: { select: { id: true, name: true } },
          manufacturer: { select: { id: true, name: true } },
          primarySupplier: { select: { id: true, name: true, kind: true, currency: true } },
          batches: {
            where: { quantityRemaining: { gt: 0 } },
            orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              receivedAt: true,
              quantityReceived: true,
              quantityRemaining: true,
              unitCost: true,
              isQuarantined: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          costHistory: {
            orderBy: { recordedAt: "desc" },
            take: 10,
            select: {
              id: true,
              // Already the landed cost of one unit of sale in GH₵ — the model
              // says so, and the goods-receipt posting is what writes it.
              unitCost: true,
              quantity: true,
              source: true,
              recordedAt: true,
              note: true,
              supplier: { select: { name: true } },
            },
          },
          _count: { select: { salesOrderItems: true, quotationItems: true, batches: true } },
        },
      }),
    null,
  );
}

/** Categories for a filter or a select, with how many products each holds. */
export async function listCategoriesForFilter() {
  return readMedical(
    async () => {
      const rows = await medicalDb.medicalCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      });
      return rows
        .filter((row) => row._count.products > 0)
        .map((row) => ({ value: row.id, label: row.name, count: row._count.products }));
    },
    [],
  );
}

/** Every active supplier, for the product form's own select. */
export async function listSuppliersForSelect() {
  return readMedical(
    () =>
      medicalDb.supplier.findMany({
        where: { isActive: true },
        select: { id: true, name: true, currency: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    [],
  );
}
