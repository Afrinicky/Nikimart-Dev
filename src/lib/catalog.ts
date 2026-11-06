import "server-only";
import { CACHE_BACKSTOP } from "@/lib/cache-windows";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type {
  AbroadInfo,
  BadgeKind,
  Category,
  KeyAttribute,
  Product,
  ProductType,
  SellerType,
  ServiceInfo,
  Vendor,
  VerificationStatus,
} from "@/lib/types";
import { ABROAD_TYPES, isAbroadType, publicAbroadInfo } from "@/lib/abroad";
import {
  readProductImageStamps,
  servedGallery,
  servedProductImage,
} from "@/lib/product-image-stamps";
import { readVendorImageStamps, servedVendorImage } from "@/lib/vendor-image-stamps";
import type {
  Prisma,
  Product as PrismaProduct,
  Category as PrismaCategory,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Mappers: Prisma rows -> the app's shared domain types. JSON-encoded string
// columns (badges, locationIds, sellerTypes, preorder/service info) are parsed
// back into arrays/objects so the UI components stay unchanged.
// ---------------------------------------------------------------------------

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapCategory(c: PrismaCategory): Category {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    description: c.description,
    productCount: c.productCount,
    commissionRate: c.commissionRate ?? null,
    affiliateCommissionRate: c.affiliateCommissionRate ?? null,
  };
}

/**
 * The columns a storefront shop card reads — VENDOR_SELECT plus the two
 * branding links that `readVendors` resolves. Spelled out rather than taking a
 * whole `Vendor` row so that a caller cannot hand this the payout details by
 * accident, and so removing a column from the select below is a type error
 * here rather than an empty field on a page.
 */
export type VendorCardRow = Prisma.VendorGetPayload<{ select: typeof VENDOR_SELECT }> & {
  logoUrl: string;
  bannerUrl: string;
};

export function mapVendor(v: VendorCardRow): Vendor {
  return {
    id: v.id,
    slug: v.slug,
    businessName: v.businessName,
    sellerTypes: parseJSON<SellerType[]>(v.sellerTypes, []),
    description: v.description,
    initials: v.initials,
    accentFrom: v.accentFrom,
    accentTo: v.accentTo,
    locationIds: parseJSON<string[]>(v.locationIds, []),
    originCountry: v.originCountry,
    verificationStatus: v.verificationStatus as VerificationStatus,
    rating: v.rating,
    reviewCount: v.reviewCount,
    totalSales: v.totalSales,
    isOfficial: v.isOfficial,
    deliveryAvailable: v.deliveryAvailable,
    pickupAvailable: v.pickupAvailable,
    sameDayDeliveryAvailable: v.sameDayDeliveryAvailable,
    logoUrl: v.logoUrl || undefined,
    bannerUrl: v.bannerUrl || undefined,
    whatsapp: v.whatsapp || undefined,
  };
}

/**
 * A database row as a Product.
 *
 * Public by default, and that is the important part. Where a seller buys a
 * listing, who from and how that supplier is reached are the seller's
 * business: handing them to a shopper hands over the margin and invites the
 * shop to be cut out of its own sale. They are stripped here, at the one place
 * every storefront read passes through, so a screen written next year cannot
 * print them by accident — it will not have them.
 *
 * The two screens that may see them — the admin's product form and a seller
 * editing their own listing — ask for them explicitly. An opt-in is a line a
 * reviewer can see; an opt-out is one nobody notices is missing.
 */
export function mapProduct(
  p: PrismaProduct & { images?: { url: string }[]; vendor?: { originCountry: string } | null },
  options: { includeSourcing?: boolean } = {},
): Product {
  const gallery = (p.images ?? []).map((i) => i.url);
  const sourcing = options.includeSourcing === true;
  const terms = p.preorderInfo
    ? parseJSON<AbroadInfo | undefined>(p.preorderInfo, undefined)
    : undefined;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    categoryId: p.categoryId,
    vendorId: p.vendorId,
    description: p.description,
    price: p.price,
    oldPrice: p.oldPrice ?? undefined,
    stockQuantity: p.stockQuantity,
    moq: p.moq,
    productType: p.productType as ProductType,
    badges: parseJSON<BadgeKind[]>(p.badges, []),
    locationIds: parseJSON<string[]>(p.locationIds, []),
    campusDeliveryAvailable: p.campusDeliveryAvailable,
    pickupAvailable: p.pickupAvailable,
    sameDayDeliveryAvailable: p.sameDayDeliveryAvailable,
    isOfficial: p.isOfficial,
    isFeatured: p.isFeatured,
    rating: p.rating,
    reviewCount: p.reviewCount,
    gradientFrom: p.gradientFrom,
    gradientTo: p.gradientTo,
    emoji: p.emoji,
    shippingWeightKg: p.shippingWeightKg,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    cbm: p.cbm,
    image: gallery[0] ?? p.image ?? undefined,
    images: gallery.length ? gallery : p.image ? [p.image] : [],
    // The listing's own origin wins over the shop's. A seller in Accra
    // dropshipping from Guangzhou has a GH vendor and a CN product; reading the
    // vendor alone showed every such listing as local.
    originCountry: p.originCountry || p.vendor?.originCountry || "GH",
    sourceUrl: sourcing ? p.sourceUrl || undefined : undefined,
    supplierName: sourcing ? p.supplierName || undefined : undefined,
    supplierContact: sourcing ? p.supplierContact || undefined : undefined,
    freightMode: p.freightMode || undefined,
    arrivalPointId: p.arrivalPointId ?? null,
    freightIncluded: p.supplierDelivers,
    forwarderId: p.forwarderId ?? null,
    shippingMethod: p.shippingMethod,
    manualShippingFee: p.manualShippingFee,
    shippingOnPickup: p.shippingOnPickup,
    attributes: parseJSON<KeyAttribute[]>(p.attributes, []),
    affiliateEnabled: p.affiliateEnabled,
    affiliateEnrolledBy: p.affiliateEnrolledBy,
    affiliateCommissionRate: p.affiliateCommissionRate ?? null,
    isArchived: p.isArchived,
    // The terms carry the sourcing fields in their JSON too, so the blob is
    // cleaned rather than only the columns beside it.
    preorderInfo: terms ? (sourcing ? terms : publicAbroadInfo(terms)) : undefined,
    serviceInfo: p.serviceInfo ? parseJSON<ServiceInfo | undefined>(p.serviceInfo, undefined) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cached loaders (deduped per request). All catalog data is loaded once and
// filtered in memory — the dataset is small and this keeps the many helper
// calls fast without a query each.
// ---------------------------------------------------------------------------

// Loaders return empty results (rather than throwing) if the database is
// unreachable, so a DB outage degrades the storefront to an empty state instead
// of crashing every page with a 500.

/**
 * Cache tag for the category list. Any write to a category must revalidate it.
 */
export const CATEGORIES_TAG = "categories";

const readCategories = unstable_cache(
  async () => prisma.category.findMany({ orderBy: { name: "asc" } }),
  ["categories"],
  { tags: [CATEGORIES_TAG], revalidate: CACHE_BACKSTOP },
);

/**
 * The category list, cached across requests.
 *
 * Like the settings, this is read by the header on every page, so a per-render
 * `cache()` left it being fetched once per page view — the most-scanned table
 * in the database. The rows are small, but the read was constant.
 */
export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const rows = await readCategories();
    return rows.map(mapCategory);
  } catch {
    return [];
  }
});

/** Cache tag for the shop list. Any vendor write must drop it. */
export const VENDORS_TAG = "vendors";

/**
 * What a shop shows on the storefront — and nothing else.
 *
 * This was a `findMany` with no `select`, so it read every column of every
 * shop on every catalogue page: the two branding images, which may each be a
 * whole picture stored as base64, and the shop's momo and bank account
 * details, which no storefront page has any business reading. `mapVendor`
 * dropped the payout fields on the way out, which meant nobody noticed they
 * were being read in the first place.
 *
 * The branding arrives as links built from digests the database computes (see
 * lib/vendor-image-stamps.ts) rather than as the pictures themselves.
 */
const VENDOR_SELECT = {
  id: true, slug: true, businessName: true, sellerTypes: true, description: true,
  initials: true, accentFrom: true, accentTo: true, locationIds: true,
  originCountry: true, verificationStatus: true, rating: true, reviewCount: true,
  totalSales: true, isOfficial: true, deliveryAvailable: true, pickupAvailable: true,
  sameDayDeliveryAvailable: true, whatsapp: true,
} as const;

const readVendors = unstable_cache(
  async () => {
    const [rows, stamps] = await Promise.all([
      prisma.vendor.findMany({ orderBy: { businessName: "asc" }, select: VENDOR_SELECT }),
      readVendorImageStamps(),
    ]);
    return rows.map((row) => ({
      ...row,
      logoUrl: servedVendorImage(row.id, "logo", stamps.get(row.id)?.logo),
      bannerUrl: servedVendorImage(row.id, "banner", stamps.get(row.id)?.banner),
    }));
  },
  ["vendors"],
  { tags: [VENDORS_TAG], revalidate: CACHE_BACKSTOP },
);

/**
 * Shop ids to shop names, and nothing more.
 *
 * Every catalogue page needs this to print "sold by" under a card, and it used
 * to be built by reading every shop in full and throwing all but two columns
 * away. Two columns is what it asks for now.
 */
const readVendorNames = unstable_cache(
  async () =>
    prisma.vendor.findMany({
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true },
    }),
  ["vendor-names"],
  { tags: [VENDORS_TAG], revalidate: CACHE_BACKSTOP },
);

export const getVendors = cache(async (): Promise<Vendor[]> => {
  try {
    const rows = await readVendors();
    return rows.map(mapVendor);
  } catch {
    return [];
  }
});

/**
 * What a product *listing* fetches — everything a card renders, and nothing a
 * card never shows.
 *
 * Prisma selects every scalar on a model unless told otherwise, so the listing
 * query used to carry each product's full `description` and its `attributes`
 * spec table across the network, on every page view, for every product on the
 * page. A grid shows none of it. On a catalogue of any size that is the single
 * largest thing the database sends all day, and it is metered.
 *
 * Note `images: take: 1`: a card shows one thumbnail, and `include` was
 * fetching every image row of every product to render it.
 *
 * The four omitted fields come back empty from `mapProductCard`. Nothing in a
 * listing reads them — search is the one thing that ever did, and it now runs
 * in the database (see filterProducts) rather than pulling the text out to
 * match it here. A page that needs the whole product uses getProductBySlug,
 * which fetches one row in full.
 */
const CARD_SELECT = {
  id: true, slug: true, name: true, categoryId: true, vendorId: true,
  price: true, oldPrice: true, stockQuantity: true, moq: true, productType: true,
  badges: true, locationIds: true,
  campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
  isOfficial: true, isFeatured: true, rating: true, reviewCount: true,
  gradientFrom: true, gradientTo: true, emoji: true,
  originCountry: true, isArchived: true,
  sourceUrl: true, supplierName: true, freightMode: true, supplierDelivers: true,
  shippingWeightKg: true, lengthCm: true, widthCm: true, heightCm: true, cbm: true,
  arrivalPointId: true, forwarderId: true, forwarderRouteId: true,
  shippingMethod: true, manualShippingFee: true, shippingOnPickup: true,
  affiliateEnabled: true, affiliateEnrolledBy: true, affiliateCommissionRate: true,
  vendor: { select: { originCountry: true } },
} as const;

// Deliberately absent: `image` and the `images` relation.
//
// Both columns hold an entire photograph as base64 (see
// lib/product-image-stamps.ts), so selecting them put hundreds of kilobytes
// per card into the query result, the cache entry and the rendered page. The
// card's picture now arrives as a link, built from a digest the database
// computes — a few dozen bytes instead of a few hundred kilobytes.

// Derived from the select itself, so adding or removing a column above cannot
// leave this type quietly describing a row shape that is no longer fetched.
type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }> & {
  /** The product's picture as a link — see readProductCards. */
  imageUrl: string | null;
};

/**
 * A card row as a Product. The four fields a card never shows are filled in
 * empty rather than fetched — see CARD_SELECT.
 */
function mapProductCard(row: CardRow): Product {
  const { imageUrl, ...rest } = row;
  return mapProduct({
    ...rest,
    image: imageUrl,
    images: imageUrl ? [{ url: imageUrl }] : [],
    description: "",
    attributes: "[]",
    preorderInfo: null,
    serviceInfo: null,
    supplierContact: "",
    supplierFreight: 0,
  } as unknown as PrismaProduct & { images?: { url: string }[]; vendor?: { originCountry: string } | null });
}

/** Only listings a shopper may see. Archived products keep their order history but leave the storefront. */
const LIVE = { isArchived: false } as const;

/**
 * Every live product, as cards.
 *
 * `cache` is React's per-request dedupe, not a cache between requests — two
 * components on one page share a fetch, the next visitor does not. So keep the
 * callers below narrowing in SQL rather than calling this and filtering in
 * JavaScript: a category page that wants twelve products should ask for twelve.
 */
/** Cache tag for every product listing. Any write that changes a card drops it. */
export const PRODUCTS_TAG = "products";

/**
 * The one query every listing goes through, cached across requests.
 *
 * `/products` is a dynamic route — it has to be, it reads filters from the
 * query string — so before this it re-read the catalogue for every visitor and
 * every bot. The cache key includes the `where` and the limit, so each distinct
 * filter keeps its own entry and a repeat of the same view costs nothing.
 *
 * Short window, and every catalogue write drops the tag, so an edit is live at
 * once. A card can still be up to the window out of date on stock, which is
 * safe: the product page itself is uncached, and checkout reserves stock with
 * an atomic guarded decrement, so a sold-out product cannot be oversold from a
 * stale grid — the race simply fails and rolls back.
 */
const readProductCards = unstable_cache(
  async (where: Record<string, unknown>, take?: number) => {
    const rows = await prisma.product.findMany({
      where: { ...LIVE, ...where },
      orderBy: { name: "asc" },
      select: CARD_SELECT,
      ...(take ? { take } : {}),
    });
    // The picture, as a link. Fetched alongside rather than selected with the
    // rows above, because the column it comes from holds the whole photograph
    // and this returns only its digest — which is what keeps this entry small
    // enough to actually be cached. An entry over 2 MB is silently refused,
    // and a page of base64 photographs clears that inside ten products, so
    // before this the cache around this read did nothing at all.
    const stamps = await readProductImageStamps(rows.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      imageUrl: servedProductImage(row.id, stamps.get(row.id)?.[0]) ?? null,
    }));
  },
  ["product-cards"],
  { tags: [PRODUCTS_TAG], revalidate: CACHE_BACKSTOP },
);

export const getProducts = cache(async (): Promise<Product[]> => {
  try {
    const rows = await readProductCards({});
    return rows.map(mapProductCard);
  } catch {
    return [];
  }
});

/** The same list, narrowed in the database. */
async function listProducts(
  where: Record<string, unknown>,
  opts: { take?: number } = {},
): Promise<Product[]> {
  try {
    const rows = await readProductCards(where, opts.take);
    return rows.map(mapProductCard);
  } catch {
    return [];
  }
}

/**
 * How many products the homepage renders before pointing at /products.
 *
 * The homepage used to render the whole catalogue — every product, on the
 * busiest page on the site, fetched fresh for each visitor. Nobody scrolls a
 * thousand cards; they search or pick a category. This is a full screen of
 * browsing with a way through to the rest.
 */
export const HOME_PRODUCT_LIMIT = 48;

/**
 * The homepage grid. Ordered by name like every other listing — Product has no
 * created date to sort "newest" by, and inventing one is a schema change this
 * does not need.
 */
export async function getHomeProducts(limit = HOME_PRODUCT_LIMIT): Promise<Product[]> {
  return listProducts({}, { take: limit });
}

/** How many live products there are, for "showing 48 of 320". */
export async function countProducts(): Promise<number> {
  try {
    return await prisma.product.count({ where: LIVE });
  } catch {
    return 0;
  }
}

/**
 * `badges` and `locationIds` are JSON arrays kept in text columns, so matching
 * one means matching its quoted form — `"flash_sale"` and not `flash_sale`,
 * which would also match a badge that merely starts with it.
 */
function jsonArrayHas(value: string) {
  return { contains: `"${value}"` };
}

/** Products enrolled in the affiliate program (for affiliates to promote). */
export const getAffiliateProducts = cache(async (): Promise<Product[]> => {
  try {
    const rows = await prisma.product.findMany({
      where: { affiliateEnabled: true },
      orderBy: { name: "asc" },
      include: { images: { orderBy: { order: "asc" } }, vendor: { select: { originCountry: true } } },
    });
    return rows.map((row) => mapProduct(row));
  } catch {
    return [];
  }
});

// A quick id -> businessName map for product cards.
export const getVendorNameMap = cache(async (): Promise<Record<string, string>> => {
  try {
    const rows = await readVendorNames();
    return Object.fromEntries(rows.map((v) => [v.id, v.businessName]));
  } catch {
    return {};
  }
});

// ---- lookups --------------------------------------------------------------

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  return (await getCategories()).find((c) => c.slug === slug);
}

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  return (await getVendors()).find((v) => v.slug === slug);
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
  return (await getVendors()).find((v) => v.id === id);
}

/**
 * One product, in full — description, spec table, every image.
 *
 * This fetched the entire catalogue and then searched it in JavaScript for a
 * single slug. A product page is the most-visited kind of page a shop has and
 * the most heavily crawled, so it was also the most expensive way the site had
 * of answering the cheapest possible question.
 */
export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  try {
    const row = await prisma.product.findUnique({
      where: { slug },
      // No `images` and no `image`: both hold whole photographs as base64, and
      // the gallery below is a *client* component, so including them meant
      // Next serialised every photograph twice — once into the HTML and again
      // into the Flight payload. A product with five pictures was several
      // megabytes of string work per request. The links come from the digests
      // instead; the bytes are served once each by /img/product/[id].
      omit: { image: true },
      include: { vendor: { select: { originCountry: true } } },
    });
    if (!row) return undefined;

    const stamps = (await readProductImageStamps([row.id])).get(row.id);
    const gallery = servedGallery(row.id, stamps);
    return mapProduct({
      ...row,
      image: gallery[0] ?? null,
      images: gallery.map((url) => ({ url })),
    });
  } catch {
    return undefined;
  }
}

export async function getProductsByCategoryId(categoryId: string): Promise<Product[]> {
  return listProducts({ categoryId });
}

export async function getProductsByVendorId(vendorId: string): Promise<Product[]> {
  return listProducts({ vendorId });
}

// ---- curated collections (mirror the old mock-data exports) ---------------

export async function getFeaturedProducts(): Promise<Product[]> {
  return listProducts({ isFeatured: true });
}
export async function getFlashSaleProducts(): Promise<Product[]> {
  return listProducts({ badges: jsonArrayHas("flash_sale") });
}
/**
 * Everything shipped from abroad, under either spelling of the type.
 *
 * Listings created before the rename still carry `productType: "preorder"`, and
 * migrations here are additive by rule, so the reconciliation lives in code.
 */
export async function getAbroadProducts(): Promise<Product[]> {
  return listProducts({ productType: { in: [...ABROAD_TYPES] } });
}

/** Imported listings from one origin country ("CN", "AE"…). */
export async function getAbroadProductsByCountry(code: string): Promise<Product[]> {
  const wanted = code.toUpperCase();
  return (await getAbroadProducts()).filter((p) => (p.originCountry ?? "GH").toUpperCase() === wanted);
}

/**
 * How many shipped-from-abroad listings each origin actually has.
 *
 * The hub used to show a fixed row of country cards whether or not anything was
 * behind them, so "Shop from China" could lead to an empty page — the worst
 * possible answer to a click, because it reads as a broken site rather than an
 * empty shelf. Counting first means an origin is only offered when there is
 * something there, and the count is on the card so nobody clicks blind.
 *
 * Listings whose seller never set a country of purchase resolve to GH and are
 * counted under it; they still appear in the hub's full grid, so they are not
 * lost — only absent from the origin shortcuts, which is honest, since nobody
 * said where they come from.
 */
export async function getAbroadOriginCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const p of await getAbroadProducts()) {
    const code = (p.originCountry ?? "GH").toUpperCase();
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}
export async function getServiceProducts(): Promise<Product[]> {
  return listProducts({ productType: "service" });
}
export async function getFoodProducts(): Promise<Product[]> {
  return listProducts({ productType: "food" });
}
export async function getOfficialProducts(): Promise<Product[]> {
  return listProducts({ isOfficial: true });
}

/**
 * A few things to look at next. Same category first, topped up from elsewhere
 * if that runs short — and never more than `limit` rows fetched, where this
 * used to read the whole catalogue to show six of it.
 */
export async function getRelatedProducts(product: Product, limit = 6): Promise<Product[]> {
  const sameCat = await listProducts(
    { categoryId: product.categoryId, id: { not: product.id } },
    { take: limit },
  );
  if (sameCat.length >= limit) return sameCat;
  const rest = await listProducts(
    { categoryId: { not: product.categoryId }, id: { not: product.id } },
    { take: limit - sameCat.length },
  );
  return sameCat.concat(rest);
}

// ---- filtering / search ---------------------------------------------------

export interface ProductFilters {
  q?: string;
  category?: string; // category slug
  badge?: string; // BadgeKind
  type?: string; // ProductType
  maxPrice?: number;
  minPrice?: number;
}

/**
 * Search and filter, in the database.
 *
 * This used to load every product and narrow the array — which meant a search
 * for one phone downloaded the whole catalogue, descriptions included, to throw
 * nearly all of it away. Postgres does the same work without sending the rows,
 * and matches case-insensitively rather than by lowercasing every string in
 * JavaScript first.
 */
/**
 * How many cards one catalogue view renders.
 *
 * /products rendered every match, with no limit and no paging. On a shop with
 * a few hundred listings that is a few hundred cards built, serialised and
 * compressed for every request — and the route cannot be prerendered, because
 * it reads its filters from the query string, so that happened per visitor and
 * per crawler. Nobody scrolls past the first screen or two; a cap turns an
 * unbounded page into a bounded one and costs nothing a shopper notices.
 */
export const CATALOGUE_PAGE_LIMIT = 96;

async function productFilterWhere(filters: ProductFilters): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {};

  if (filters.category) {
    const cat = (await getCategories()).find((c) => c.slug === filters.category);
    // An unknown category slug matched nothing before and still matches nothing.
    where.categoryId = cat ? cat.id : "\u0000none";
  }
  if (filters.badge) where.badges = jsonArrayHas(filters.badge);
  if (filters.type) {
    // "shipped_from_abroad" has to match its legacy spelling too, or a filter
    // silently hides every listing made before the rename.
    where.productType = isAbroadType(filters.type)
      ? { in: [...ABROAD_TYPES] }
      : filters.type;
  }
  if (typeof filters.maxPrice === "number" || typeof filters.minPrice === "number") {
    where.price = {
      ...(typeof filters.maxPrice === "number" ? { lte: filters.maxPrice } : {}),
      ...(typeof filters.minPrice === "number" ? { gte: filters.minPrice } : {}),
    };
  }
  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { vendor: { businessName: { contains: q, mode: "insensitive" } } },
      ];
    }
  }

  return where;
}

export async function filterProducts(
  filters: ProductFilters,
  opts: { take?: number } = {},
): Promise<Product[]> {
  return listProducts(await productFilterWhere(filters), {
    take: opts.take ?? CATALOGUE_PAGE_LIMIT,
  });
}

/**
 * How many products match a filter, for "showing 96 of 320".
 *
 * A `count` in the database rather than the length of a list: the whole point
 * of the cap above is not to pull rows nobody is going to see.
 */
export const countFilteredProducts = unstable_cache(
  async (filters: ProductFilters): Promise<number> => {
    try {
      return await prisma.product.count({
        where: { ...LIVE, ...(await productFilterWhere(filters)) },
      });
    } catch {
      return 0;
    }
  },
  ["product-filter-count"],
  { tags: [PRODUCTS_TAG], revalidate: CACHE_BACKSTOP },
);

export async function getProductsForLocation(locationId: string): Promise<Product[]> {
  if (locationId === "any") return getProducts();
  // A listing is available here if it names this place, or says "any".
  return listProducts({
    OR: [{ locationIds: jsonArrayHas(locationId) }, { locationIds: jsonArrayHas("any") }],
  });
}

/**
 * Products whose origin country matches `code` (e.g. "CN", "US").
 *
 * The country on a listing is the listing's own, falling back to its shop's,
 * falling back to GH — `Product.originCountry` defaults to empty and
 * `Vendor.originCountry` to "GH". So the match is those three cases spelled
 * out, rather than one column comparison that would miss every listing whose
 * seller left the field alone. This is called with "GH" for the local grid, so
 * it covers the whole catalogue and not only imported listings.
 */
export async function getProductsByCountry(code: string): Promise<Product[]> {
  return listProducts({
    OR: [
      { originCountry: code },
      { AND: [{ originCountry: "" }, { vendor: { originCountry: code } }] },
      ...(code === "GH"
        ? [{ AND: [{ originCountry: "" }, { vendor: { originCountry: "" } }] }]
        : []),
    ],
  });
}

export async function getVendorsForLocation(locationId: string): Promise<Vendor[]> {
  const all = await getVendors();
  if (locationId === "any") return all;
  return all.filter((v) => v.locationIds.includes(locationId) || v.locationIds.includes("any"));
}

/**
 * Every live product's slug, and nothing else.
 *
 * For the sitemap, which needs one short string per product and must never be
 * the thing that drags the whole catalogue — base64 photographs and all —
 * through the cache. Two columns, so the cached entry stays a few kilobytes
 * however large the shop gets.
 */
export const readProductSlugs = unstable_cache(
  async (take = 5000) =>
    prisma.product.findMany({
      where: LIVE,
      orderBy: { name: "asc" },
      select: { slug: true },
      take,
    }),
  ["product-slugs"],
  { tags: [PRODUCTS_TAG], revalidate: CACHE_BACKSTOP },
);

export async function getProductSlugs(take?: number): Promise<string[]> {
  try {
    return (await readProductSlugs(take)).map((row) => row.slug);
  } catch {
    return [];
  }
}
