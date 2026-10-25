import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { toPesewas, type Pesewas } from "@/lib/medical/money";

/**
 * Reading the catalogue, for surfaces a customer can reach.
 *
 * The privacy boundary lives here, in the select, rather than in whatever
 * template happens to render the result. `MedicalProduct` carries the supplier
 * it is bought from, what it cost, how it is sourced and the buyer's notes on
 * the last price argument, all in the same row as the name and the price —
 * because they are facts about one product and splitting them across two
 * tables would mean a join on every admin screen for no gain.
 *
 * That makes the select the only thing standing between those columns and a
 * customer. So there is exactly one of them, every public read goes through
 * it, and it is a literal — `PUBLIC_PRODUCT_SELECT` lists the columns it wants
 * by name and cannot accidentally widen. A `select` that is built up from a
 * spread, or a function that takes "extra fields", is how a cost column ends
 * up in a JSON response six months from now.
 *
 * The rule, stated once: nothing in this file may return `purchaseCost`,
 * `averageCost`, `primarySupplierId`, `sourcingMode` or `internalNotes`, and
 * nothing outside `src/lib/medical/admin/**` may call `medicalDb.medicalProduct`
 * directly.
 */

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  catalogueNumber: true,
  sku: true,
  packSize: true,
  unitOfSale: true,
  price: true,
  comparePrice: true,
  currency: true,
  minimumOrderQuantity: true,
  purchaseMode: true,
  stockOnHand: true,
  stockReserved: true,
  allowBackorder: true,
  leadTimeMinDays: true,
  leadTimeMaxDays: true,
  storageCondition: true,
  requiresColdChain: true,
  restrictedSale: true,
  status: true,
  isFeatured: true,
  isNewArrival: true,
  category: { select: { id: true, slug: true, name: true } },
  manufacturer: { select: { id: true, slug: true, name: true } },
  images: {
    select: { url: true, alt: true },
    orderBy: { position: "asc" },
    take: 1,
  },
} as const;

/** The same, plus everything the detail page shows and a listing does not. */
export const PUBLIC_PRODUCT_DETAIL_SELECT = {
  ...PUBLIC_PRODUCT_SELECT,
  description: true,
  unitsPerPack: true,
  handlingNotes: true,
  hazardClass: true,
  restrictionNote: true,
  specifications: true,
  compatibleWith: true,
  documents: true,
  tracksBatches: true,
  metaTitle: true,
  metaDescription: true,
  images: { select: { url: true, alt: true }, orderBy: { position: "asc" } },
  category: {
    select: {
      id: true,
      slug: true,
      name: true,
      parent: { select: { slug: true, name: true } },
    },
  },
  manufacturer: { select: { id: true, slug: true, name: true, country: true } },
} as const;

// ---------------------------------------------------------------------------
// What a surface actually receives
// ---------------------------------------------------------------------------

/** How a product may be bought. Changed by an administrator, never compiled in. */
export type PurchaseMode = "CHECKOUT" | "QUOTATION" | "BOTH";

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  catalogueNumber: string;
  sku: string;
  packSize: string;
  unitOfSale: string;
  /** Pesewas. Never a float — see src/lib/medical/money.ts. */
  price: Pesewas;
  comparePrice: Pesewas | null;
  minimumOrderQuantity: number;
  purchaseMode: PurchaseMode;
  availability: Availability;
  leadTime: { min: number; max: number };
  requiresColdChain: boolean;
  restrictedSale: boolean;
  isNewArrival: boolean;
  categorySlug: string;
  categoryName: string;
  manufacturerName: string | null;
  image: { url: string; alt: string } | null;
}

/**
 * What a customer is told about stock.
 *
 * Not the raw number. A laboratory does not need to know there are 43 boxes;
 * it needs to know whether ordering 20 will be a problem. Publishing the exact
 * count also tells a competitor the size of the business, and tells a customer
 * a number that was true when the page was cached. So the figure is turned
 * into one of four words here, on the server, and the count never leaves.
 */
export type Availability =
  | { kind: "IN_STOCK" }
  | { kind: "LOW_STOCK" }
  | { kind: "TO_ORDER" }
  | { kind: "OUT_OF_STOCK" };

/** The threshold below which "in stock" becomes "low stock". */
const LOW_STOCK_UNITS = 5;

export function availabilityOf(product: {
  stockOnHand: number;
  stockReserved: number;
  allowBackorder: boolean;
  status: string;
}): Availability {
  const free = product.stockOnHand - product.stockReserved;
  if (free > LOW_STOCK_UNITS) return { kind: "IN_STOCK" };
  if (free > 0) return { kind: "LOW_STOCK" };
  // Nothing on the shelf. A line always brought in to order is not "out of
  // stock" — it has never been in stock and saying so loses a sale that was
  // always going to take a fortnight anyway.
  return product.allowBackorder ? { kind: "TO_ORDER" } : { kind: "OUT_OF_STOCK" };
}

/** The row Prisma hands back from `PUBLIC_PRODUCT_SELECT`, loosely typed. */
interface PublicProductRow {
  id: string;
  slug: string;
  name: string;
  summary: string;
  catalogueNumber: string;
  sku: string;
  packSize: string;
  unitOfSale: string;
  price: unknown;
  comparePrice: unknown;
  minimumOrderQuantity: number;
  purchaseMode: string;
  stockOnHand: number;
  stockReserved: number;
  allowBackorder: boolean;
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
  requiresColdChain: boolean;
  restrictedSale: boolean;
  isNewArrival: boolean;
  status: string;
  category: { slug: string; name: string };
  manufacturer: { name: string } | null;
  images: { url: string; alt: string }[];
}

export function toProductSummary(row: PublicProductRow): ProductSummary {
  const comparePrice = row.comparePrice === null ? null : toPesewas(row.comparePrice as never);
  const price = toPesewas(row.price as never);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    catalogueNumber: row.catalogueNumber,
    sku: row.sku,
    packSize: row.packSize,
    unitOfSale: row.unitOfSale,
    price,
    // A "was" price that is not actually higher is a discount that is not a
    // discount. Dropped here rather than checked at four call sites.
    comparePrice: comparePrice !== null && comparePrice > price ? comparePrice : null,
    minimumOrderQuantity: Math.max(1, row.minimumOrderQuantity),
    purchaseMode: normalisePurchaseMode(row.purchaseMode),
    availability: availabilityOf(row),
    leadTime: { min: row.leadTimeMinDays, max: row.leadTimeMaxDays },
    requiresColdChain: row.requiresColdChain,
    restrictedSale: row.restrictedSale,
    isNewArrival: row.isNewArrival,
    categorySlug: row.category.slug,
    categoryName: row.category.name,
    manufacturerName: row.manufacturer?.name ?? null,
    image: row.images[0] ?? null,
  };
}

/** An unknown mode falls back to the safest of the three: ask us. */
export function normalisePurchaseMode(value: string): PurchaseMode {
  return value === "CHECKOUT" || value === "QUOTATION" || value === "BOTH" ? value : "QUOTATION";
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Only ACTIVE products are ever listed. Draft, discontinued and archived are not. */
const LISTABLE = { status: "ACTIVE" } as const;

export async function getFeaturedProducts(take = 8): Promise<ProductSummary[]> {
  return readMedical(async () => {
    const rows = await medicalDb.medicalProduct.findMany({
      where: { ...LISTABLE, isFeatured: true },
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      take,
    });
    return rows.map((row) => toProductSummary(row as never));
  }, []);
}

export async function getNewArrivals(take = 8): Promise<ProductSummary[]> {
  return readMedical(async () => {
    const rows = await medicalDb.medicalProduct.findMany({
      where: { ...LISTABLE, isNewArrival: true },
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((row) => toProductSummary(row as never));
  }, []);
}

/**
 * The products in a category, including everything in its sub-categories.
 *
 * A buyer who clicks "Laboratory reagents" means everything under it; showing
 * only the handful filed directly against the parent reads as an empty
 * catalogue. One extra query for the child ids, rather than a recursive CTE —
 * the tree is two levels deep and twelve wide.
 */
export async function getProductsInCategory(
  categorySlug: string,
  options: { take?: number; skip?: number; orderBy?: CatalogueSort } = {},
): Promise<{ products: ProductSummary[]; total: number }> {
  return readMedical(
    async () => {
      const category = await medicalDb.medicalCategory.findUnique({
        where: { slug: categorySlug },
        select: { id: true, children: { select: { id: true } } },
      });
      if (!category) return { products: [], total: 0 };

      const categoryIds = [category.id, ...category.children.map((c) => c.id)];
      const where = { ...LISTABLE, categoryId: { in: categoryIds } };

      const [rows, total] = await Promise.all([
        medicalDb.medicalProduct.findMany({
          where,
          select: PUBLIC_PRODUCT_SELECT,
          orderBy: sortClause(options.orderBy),
          take: options.take ?? 24,
          skip: options.skip ?? 0,
        }),
        medicalDb.medicalProduct.count({ where }),
      ]);

      return { products: rows.map((row) => toProductSummary(row as never)), total };
    },
    { products: [], total: 0 },
  );
}

export type CatalogueSort = "relevance" | "price-asc" | "price-desc" | "newest" | "name";

function sortClause(sort: CatalogueSort = "relevance") {
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" as const }];
    case "price-desc":
      return [{ price: "desc" as const }];
    case "newest":
      return [{ createdAt: "desc" as const }];
    case "name":
      return [{ name: "asc" as const }];
    default:
      // Hand-set position first, so an administrator can put the thing people
      // actually come for at the top of its category.
      return [{ position: "asc" as const }, { name: "asc" as const }];
  }
}

/**
 * Search.
 *
 * Catalogue number before name, deliberately. A laboratory orders "Roche
 * 04489357190", not "glucose reagent", and a search that ranks a fuzzy name
 * match above an exact part number is a search that makes the professional
 * user scroll. Exact catalogue or SKU matches are therefore pulled out and put
 * first, and the text search fills in behind them.
 */
export async function searchProducts(
  query: string,
  options: { take?: number; skip?: number; sort?: CatalogueSort } = {},
): Promise<{ products: ProductSummary[]; total: number }> {
  const q = query.trim();
  if (q.length < 2) return { products: [], total: 0 };

  return readMedical(
    async () => {
      const contains = { contains: q, mode: "insensitive" as const };
      const where = {
        ...LISTABLE,
        OR: [
          { catalogueNumber: contains },
          { sku: contains },
          { name: contains },
          { summary: contains },
          { searchTerms: contains },
          { manufacturer: { name: contains } },
        ],
      };

      const [rows, total] = await Promise.all([
        medicalDb.medicalProduct.findMany({
          where,
          select: PUBLIC_PRODUCT_SELECT,
          orderBy: options.sort && options.sort !== "relevance" ? sortClause(options.sort) : undefined,
          take: options.take ?? 24,
          skip: options.skip ?? 0,
        }),
        medicalDb.medicalProduct.count({ where }),
      ]);

      const products = rows.map((row) => toProductSummary(row as never));
      if (options.sort && options.sort !== "relevance") return { products, total };

      const needle = q.toLowerCase();
      const rank = (p: ProductSummary) => {
        if (p.catalogueNumber.toLowerCase() === needle || p.sku.toLowerCase() === needle) return 0;
        if (p.catalogueNumber.toLowerCase().includes(needle)) return 1;
        if (p.name.toLowerCase().startsWith(needle)) return 2;
        if (p.name.toLowerCase().includes(needle)) return 3;
        return 4;
      };
      // Sorted in memory because it is one page of rows and the alternative is
      // a raw query with its own ranking expression, which is a lot of surface
      // area for a list of twenty-four.
      products.sort((a, b) => rank(a) - rank(b));
      return { products, total };
    },
    { products: [], total: 0 },
  );
}

export async function getProductBySlug(slug: string) {
  return readMedical(
    () =>
      medicalDb.medicalProduct.findFirst({
        where: { slug, status: { in: ["ACTIVE", "OUT_OF_STOCK"] } },
        select: PUBLIC_PRODUCT_DETAIL_SELECT,
      }),
    null,
  );
}

/** Other things from the same category, for the foot of a product page. */
export async function getRelatedProducts(
  categoryId: string,
  excludeId: string,
  take = 6,
): Promise<ProductSummary[]> {
  return readMedical(async () => {
    const rows = await medicalDb.medicalProduct.findMany({
      where: { ...LISTABLE, categoryId, id: { not: excludeId } },
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ isFeatured: "desc" }, { position: "asc" }],
      take,
    });
    return rows.map((row) => toProductSummary(row as never));
  }, []);
}

/**
 * Parse the JSON columns.
 *
 * Specifications, compatibility and documents are stored as JSON because they
 * are read and written as a block and never queried by their parts. They are
 * also administrator-entered, which means a malformed one is a question of
 * when and not if — so parsing never throws, it returns nothing and the
 * section does not render.
 */
export interface Specification {
  label: string;
  value: string;
}

export function parseSpecifications(raw: string): Specification[] {
  return parseArray(raw).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, value } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof value !== "string") return [];
    if (!label.trim() || !value.trim()) return [];
    return [{ label: label.trim(), value: value.trim() }];
  });
}

export function parseStringList(raw: string): string[] {
  return parseArray(raw).flatMap((entry) =>
    typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
  );
}

export interface ProductDocument {
  label: string;
  url: string;
  kind: string;
}

export function parseDocuments(raw: string): ProductDocument[] {
  return parseArray(raw).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, url, kind } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof url !== "string") return [];
    // Only http(s). A `javascript:` or `data:` URL in an administrator-entered
    // field is a stored cross-site scripting hole with a download icon on it.
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ label, url, kind: typeof kind === "string" ? kind : "document" }];
  });
}

function parseArray(raw: string): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The products that have actually sold the most, over a window.
 *
 * Computed from order lines, not from a flag an administrator ticks. A
 * "popular products" rail populated by hand is a rail that says whatever
 * somebody decided in March, and a dashboard figure that is not a measurement
 * is worse than no figure at all.
 *
 * It returns nothing until there are orders, and the section that calls it
 * does not render. An empty rail is the correct output for a business that has
 * not sold anything yet; inventing one is not.
 */
export async function getPopularProducts(
  options: { take?: number; sinceDays?: number } = {},
): Promise<ProductSummary[]> {
  const take = options.take ?? 8;
  const since = new Date();
  since.setDate(since.getDate() - (options.sinceDays ?? 90));

  return readMedical(async () => {
    const lines = await medicalDb.salesOrderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        salesOrder: {
          placedAt: { gte: since },
          // Cancelled and refunded orders are not evidence of demand.
          fulfilmentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take,
    });

    const ids = lines.map((line) => line.productId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const rows = await medicalDb.medicalProduct.findMany({
      where: { ...LISTABLE, id: { in: ids } },
      select: PUBLIC_PRODUCT_SELECT,
    });

    // `findMany` on an id list comes back in whatever order the index gives,
    // which is not the order of sales. Re-sorted to match the grouping, or the
    // "best selling" rail is a rail in arbitrary order.
    const rank = new Map(ids.map((id, index) => [id, index]));
    return rows
      .map((row) => toProductSummary(row as never))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, []);
}
