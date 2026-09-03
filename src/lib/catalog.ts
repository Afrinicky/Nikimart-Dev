import "server-only";
import { cache } from "react";
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
import { ABROAD_TYPES, isAbroadType } from "@/lib/abroad";
import type {
  Product as PrismaProduct,
  Vendor as PrismaVendor,
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

export function mapVendor(v: PrismaVendor): Vendor {
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

export function mapProduct(
  p: PrismaProduct & { images?: { url: string }[]; vendor?: { originCountry: string } | null },
): Product {
  const gallery = (p.images ?? []).map((i) => i.url);
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
    sourceUrl: p.sourceUrl || undefined,
    supplierName: p.supplierName || undefined,
    freightMode: p.freightMode || undefined,
    arrivalPointId: p.arrivalPointId ?? null,
    freightIncluded: p.freightIncluded,
    forwarderId: p.forwarderId ?? null,
    shippingMethod: p.shippingMethod,
    manualShippingFee: p.manualShippingFee,
    shippingOnPickup: p.shippingOnPickup,
    attributes: parseJSON<KeyAttribute[]>(p.attributes, []),
    affiliateEnabled: p.affiliateEnabled,
    affiliateEnrolledBy: p.affiliateEnrolledBy,
    affiliateCommissionRate: p.affiliateCommissionRate ?? null,
    isArchived: p.isArchived,
    preorderInfo: p.preorderInfo ? parseJSON<AbroadInfo | undefined>(p.preorderInfo, undefined) : undefined,
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

export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return rows.map(mapCategory);
  } catch {
    return [];
  }
});

export const getVendors = cache(async (): Promise<Vendor[]> => {
  try {
    const rows = await prisma.vendor.findMany({ orderBy: { businessName: "asc" } });
    return rows.map(mapVendor);
  } catch {
    return [];
  }
});

export const getProducts = cache(async (): Promise<Product[]> => {
  try {
    const rows = await prisma.product.findMany({
      // Archived products keep their order history but leave the storefront.
      where: { isArchived: false },
      orderBy: { name: "asc" },
      include: { images: { orderBy: { order: "asc" } }, vendor: { select: { originCountry: true } } },
    });
    return rows.map(mapProduct);
  } catch {
    return [];
  }
});

/** Products enrolled in the affiliate program (for affiliates to promote). */
export const getAffiliateProducts = cache(async (): Promise<Product[]> => {
  try {
    const rows = await prisma.product.findMany({
      where: { affiliateEnabled: true },
      orderBy: { name: "asc" },
      include: { images: { orderBy: { order: "asc" } }, vendor: { select: { originCountry: true } } },
    });
    return rows.map(mapProduct);
  } catch {
    return [];
  }
});

// A quick id -> businessName map for product cards.
export const getVendorNameMap = cache(async (): Promise<Record<string, string>> => {
  const vendors = await getVendors();
  return Object.fromEntries(vendors.map((v) => [v.id, v.businessName]));
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

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await getProducts()).find((p) => p.slug === slug);
}

export async function getProductsByCategoryId(categoryId: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.categoryId === categoryId);
}

export async function getProductsByVendorId(vendorId: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.vendorId === vendorId);
}

// ---- curated collections (mirror the old mock-data exports) ---------------

export async function getFeaturedProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.isFeatured);
}
export async function getFlashSaleProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.badges.includes("flash_sale"));
}
/**
 * Everything shipped from abroad, under either spelling of the type.
 *
 * Listings created before the rename still carry `productType: "preorder"`, and
 * migrations here are additive by rule, so the reconciliation lives in code.
 */
export async function getAbroadProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => isAbroadType(p.productType));
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
  return (await getProducts()).filter((p) => p.productType === "service");
}
export async function getFoodProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.productType === "food");
}
export async function getOfficialProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.isOfficial);
}

export async function getRelatedProducts(product: Product, limit = 6): Promise<Product[]> {
  const all = await getProducts();
  const sameCat = all.filter((p) => p.id !== product.id && p.categoryId === product.categoryId);
  const otherCat = all.filter((p) => p.id !== product.id && p.categoryId !== product.categoryId);
  return sameCat.concat(otherCat).slice(0, limit);
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

export async function filterProducts(filters: ProductFilters): Promise<Product[]> {
  const [all, categories, vendorNames] = await Promise.all([
    getProducts(),
    getCategories(),
    getVendorNameMap(),
  ]);
  let result = [...all];
  if (filters.category) {
    const cat = categories.find((c) => c.slug === filters.category);
    if (cat) result = result.filter((p) => p.categoryId === cat.id);
  }
  if (filters.badge) {
    result = result.filter((p) => p.badges.includes(filters.badge as BadgeKind));
  }
  if (filters.type) {
    // "shipped_from_abroad" has to match its legacy spelling too, or a filter
    // silently hides every listing made before the rename.
    const wanted = isAbroadType(filters.type)
      ? (ABROAD_TYPES as readonly string[])
      : [filters.type];
    result = result.filter((p) => wanted.includes(p.productType));
  }
  if (typeof filters.maxPrice === "number") {
    result = result.filter((p) => p.price <= filters.maxPrice!);
  }
  if (typeof filters.minPrice === "number") {
    result = result.filter((p) => p.price >= filters.minPrice!);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase().trim();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (vendorNames[p.vendorId]?.toLowerCase().includes(q) ?? false),
    );
  }
  return result;
}

export async function getProductsForLocation(locationId: string): Promise<Product[]> {
  const all = await getProducts();
  if (locationId === "any") return all;
  return all.filter((p) => p.locationIds.includes(locationId) || p.locationIds.includes("any"));
}

/** Products whose origin country matches `code` (e.g. "CN", "US"). */
export async function getProductsByCountry(code: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => (p.originCountry ?? "GH") === code);
}

export async function getVendorsForLocation(locationId: string): Promise<Vendor[]> {
  const all = await getVendors();
  if (locationId === "any") return all;
  return all.filter((v) => v.locationIds.includes(locationId) || v.locationIds.includes("any"));
}
