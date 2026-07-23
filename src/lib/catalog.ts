import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type {
  BadgeKind,
  Category,
  KeyAttribute,
  PreorderInfo,
  Product,
  ProductType,
  SellerType,
  ServiceInfo,
  Vendor,
  VerificationStatus,
} from "@/lib/types";
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
    image: gallery[0] ?? p.image ?? undefined,
    images: gallery.length ? gallery : p.image ? [p.image] : [],
    originCountry: p.vendor?.originCountry ?? "GH",
    attributes: parseJSON<KeyAttribute[]>(p.attributes, []),
    preorderInfo: p.preorderInfo ? parseJSON<PreorderInfo | undefined>(p.preorderInfo, undefined) : undefined,
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
export async function getPreorderProducts(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.productType === "preorder");
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
    result = result.filter((p) => p.productType === filters.type);
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
