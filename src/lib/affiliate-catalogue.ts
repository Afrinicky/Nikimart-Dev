import "server-only";
import { prisma } from "@/lib/prisma";
import { money, resolveCommissionRate } from "@/lib/commission";
import { getCommissionRate } from "@/lib/settings";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { resolveProductRate, type RateSource } from "@/lib/affiliate-policy";

/**
 * The catalogue an affiliate browses: **every** active, publicly listed
 * product on Nickimart, not only the ones already enrolled.
 *
 * The old list showed enrolled products alone, which quietly made the console
 * useless for the thing affiliates actually do — they are asked for a
 * particular item, they look for it, and an empty result told them nothing
 * about whether it exists, whether it pays, or who to ask. So the whole shelf
 * is here and each row says plainly whether it is eligible, what it pays, and
 * who funds it. "Not in the programme" is an answer; a missing row is not.
 *
 * Eligibility is derived, never typed: it is the same resolution the checkout
 * runs, so a row that says 7% is a row that will pay 7%.
 */

export interface CatalogueProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  oldPrice: number | null;
  image: string | null;
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  stockQuantity: number;
  productType: string;
  rating: number;
  reviewCount: number;
  /** True when a referral through this product earns commission. */
  eligible: boolean;
  /** Effective commission percent. 0 when not eligible. */
  rate: number;
  /** Cash earned on one unit at today's price. */
  earnPerSale: number;
  /** "seller" | "platform" | "" — whose money funds the commission. */
  fundedBy: string;
  /** Which rule set the rate, so the console can explain it. */
  rateSource: RateSource;
  /** Why it is not eligible, in words, when it is not. */
  reason: string;
  /** True when this affiliate has already added it to their list. */
  selected: boolean;
  /** Their link code for it, once added. */
  linkCode: string | null;
}

export interface CatalogueFilters {
  q?: string;
  /** Category slug. */
  category?: string;
  /** Vendor (shop) slug. */
  shop?: string;
  /** "all" | "eligible" | "ineligible" | "mine" */
  eligibility?: string;
  /** "earn" | "commission" | "featured" | "price" | "price_desc" | "name" */
  sort?: string;
}

export const CATALOGUE_ELIGIBILITY_OPTIONS = [
  { value: "all", label: "All products" },
  { value: "eligible", label: "Earns commission" },
  { value: "mine", label: "On my list" },
  { value: "ineligible", label: "Not in the programme" },
];

export const CATALOGUE_SORT_OPTIONS = [
  { value: "earn", label: "Highest earnings" },
  { value: "commission", label: "Highest rate" },
  { value: "featured", label: "Featured first" },
  { value: "price", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

/** Product types that are never a thing an affiliate can send somebody to buy. */
const UNSHAREABLE = new Set(["service"]);

/**
 * Everything a catalogue row needs, in one place.
 *
 * Shared by the list and the single-product read so the two cannot resolve a
 * product differently — a card saying 7% over a flyer paying 5% is the bug
 * this shape exists to prevent.
 */
const CATALOGUE_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  oldPrice: true,
  image: true,
  emoji: true,
  gradientFrom: true,
  gradientTo: true,
  stockQuantity: true,
  productType: true,
  rating: true,
  reviewCount: true,
  affiliateEnabled: true,
  affiliateEnrolledBy: true,
  affiliateCommissionRate: true,
  categoryId: true,
  vendorId: true,
  category: { select: { name: true, slug: true, commissionRate: true, affiliateCommissionRate: true } },
  vendor: { select: { businessName: true, slug: true } },
  images: { orderBy: { order: "asc" as const }, take: 1, select: { url: true } },
} as const;

type CatalogueSource = {
  id: string;
  name: string;
  slug: string;
  price: number;
  oldPrice: number | null;
  image: string | null;
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
  stockQuantity: number;
  productType: string;
  rating: number;
  reviewCount: number;
  affiliateEnabled: boolean;
  affiliateEnrolledBy: string;
  affiliateCommissionRate: number | null;
  categoryId: string;
  vendorId: string;
  category: { name: string; slug: string; commissionRate: number | null; affiliateCommissionRate: number | null } | null;
  vendor: { businessName: string; slug: string } | null;
  images: { url: string }[];
};

/** One product row, in affiliate terms. */
function toCatalogueProduct(
  p: CatalogueSource,
  context: {
    defaultCommission: number;
    defaultAffiliateRate: number;
    selected: Map<string, string>;
  },
): CatalogueProduct {
  const platformCommissionRate = resolveCommissionRate(
    p.category?.commissionRate,
    context.defaultCommission,
  );
  const resolved = resolveProductRate({
    affiliateEnabled: p.affiliateEnabled,
    affiliateEnrolledBy: p.affiliateEnrolledBy,
    affiliateCommissionRate: p.affiliateCommissionRate,
    categoryAffiliateRate: p.category?.affiliateCommissionRate,
    defaultAffiliateRate: context.defaultAffiliateRate,
    platformCommissionRate,
  });
  const shareable = !UNSHAREABLE.has(p.productType);
  const eligible = shareable && resolved.rate > 0;

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    image: p.images[0]?.url ?? p.image ?? null,
    emoji: p.emoji,
    gradientFrom: p.gradientFrom,
    gradientTo: p.gradientTo,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? "—",
    categorySlug: p.category?.slug ?? "",
    vendorId: p.vendorId,
    vendorName: p.vendor?.businessName ?? "Nickimart",
    vendorSlug: p.vendor?.slug ?? "",
    stockQuantity: p.stockQuantity,
    productType: p.productType,
    rating: p.rating,
    reviewCount: p.reviewCount,
    eligible,
    rate: eligible ? resolved.rate : 0,
    earnPerSale: eligible ? money((p.price * resolved.rate) / 100) : 0,
    fundedBy: eligible ? resolved.fundedBy : "",
    rateSource: resolved.source,
    reason: eligible
      ? ""
      : !shareable
        ? "Services aren't shared through affiliate links."
        : !p.affiliateEnabled
          ? "The shop hasn't offered this one to affiliates yet."
          : "Enrolled, but no commission rate is set on it yet.",
    selected: context.selected.has(p.id),
    linkCode: context.selected.get(p.id) ?? null,
  };
}

export interface CatalogueResult {
  products: CatalogueProduct[];
  total: number;
  /** Of the whole catalogue, how many earn commission. */
  eligibleTotal: number;
  /** How many this affiliate has on their list. */
  selectedTotal: number;
}

/**
 * The catalogue for one affiliate, filtered, sorted and paged.
 *
 * Paged in memory rather than in SQL because eligibility and earnings are
 * resolved per row — a `where` clause cannot express "half of the platform
 * commission, capped, unless the category says otherwise", and sorting by
 * what somebody actually earns is the one sort order that matters here. The
 * catalogue is thousands of rows, not millions; when it stops being, the rate
 * resolution moves into a materialised column and this signature does not
 * change.
 */
export async function getAffiliateCatalogue(
  affiliateId: string | null,
  filters: CatalogueFilters = {},
  page = 1,
  perPage = 24,
): Promise<CatalogueResult> {
  const [rows, defaultCommission, policy, selected] = await Promise.all([
    prisma.product.findMany({
      where: {
        isArchived: false,
        // A shop still waiting on verification is not on the storefront, so it
        // is not something to send a customer to either.
        vendor: { verificationStatus: "verified" },
      },
      // Product has no created-at column, so "newest" is not a sort this
      // table can offer; featured-then-name is the storefront's own order.
      orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
      select: CATALOGUE_SELECT,
    }),
    getCommissionRate(),
    getAffiliatePolicy(),
    affiliateId
      ? prisma.affiliateProduct
          .findMany({ where: { affiliateId }, select: { productId: true, linkCode: true } })
          .catch(() => [] as { productId: string; linkCode: string }[])
      : Promise.resolve([] as { productId: string; linkCode: string }[]),
  ]);

  const mine = new Map(selected.map((s) => [s.productId, s.linkCode]));

  const mapped: CatalogueProduct[] = rows.map((p) =>
    toCatalogueProduct(p, {
      defaultCommission,
      defaultAffiliateRate: policy.defaultRate,
      selected: mine,
    }),
  );

  const eligibleTotal = mapped.filter((p) => p.eligible).length;
  const selectedTotal = mapped.filter((p) => p.selected).length;

  const term = (filters.q ?? "").trim().toLowerCase();
  const filtered = mapped.filter((p) => {
    if (filters.category && filters.category !== "all" && p.categorySlug !== filters.category) return false;
    if (filters.shop && filters.shop !== "all" && p.vendorSlug !== filters.shop) return false;
    const mode = filters.eligibility ?? "all";
    if (mode === "eligible" && !p.eligible) return false;
    if (mode === "ineligible" && p.eligible) return false;
    if (mode === "mine" && !p.selected) return false;
    if (term) {
      const haystack = `${p.name} ${p.categoryName} ${p.vendorName}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const sorted = sortCatalogue(filtered, filters.sort ?? "earn");
  const start = Math.max(0, (page - 1) * perPage);

  return {
    products: sorted.slice(start, start + perPage),
    total: sorted.length,
    eligibleTotal,
    selectedTotal,
  };
}

function sortCatalogue(rows: CatalogueProduct[], sort: string): CatalogueProduct[] {
  const copy = [...rows];
  switch (sort) {
    case "commission":
      return copy.sort((a, b) => b.rate - a.rate || b.earnPerSale - a.earnPerSale);
    case "price":
      return copy.sort((a, b) => a.price - b.price);
    case "price_desc":
      return copy.sort((a, b) => b.price - a.price);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "featured":
      return copy; // already featured-first off the query
    case "earn":
    default:
      // Eligible first, then by what a sale is actually worth. An affiliate
      // scanning this list is choosing what to post today.
      return copy.sort(
        (a, b) =>
          Number(b.eligible) - Number(a.eligible) ||
          b.earnPerSale - a.earnPerSale ||
          a.name.localeCompare(b.name),
      );
  }
}

/**
 * One product, in affiliate terms. Null when it isn't publicly listed.
 *
 * Resolved on its own rather than by finding it in the whole catalogue: the
 * product page and the flyer screen both open with this, and scanning every
 * listing to answer a question about one of them is work nobody asked for.
 * The resolution itself is the shared mapper, so it cannot disagree with the
 * list.
 */
export async function getCatalogueProduct(
  affiliateId: string | null,
  slug: string,
): Promise<CatalogueProduct | null> {
  const [product, defaultCommission, policy] = await Promise.all([
    prisma.product
      .findUnique({
        where: { slug },
        select: {
          ...CATALOGUE_SELECT,
          isArchived: true,
          // The list only shows verified shops, so neither does this.
          vendor: { select: { businessName: true, slug: true, verificationStatus: true } },
        },
      })
      .catch(() => null),
    getCommissionRate(),
    getAffiliatePolicy(),
  ]);
  if (!product || product.isArchived) return null;
  if (product.vendor?.verificationStatus !== "verified") return null;

  const link = affiliateId
    ? await prisma.affiliateProduct
        .findUnique({
          where: { affiliateId_productId: { affiliateId, productId: product.id } },
          select: { linkCode: true },
        })
        .catch(() => null)
    : null;

  return toCatalogueProduct(product, {
    defaultCommission,
    defaultAffiliateRate: policy.defaultRate,
    selected: new Map(link ? [[product.id, link.linkCode]] : []),
  });
}

/** The categories and shops the catalogue filters offer. */
export async function getCatalogueFacets(): Promise<{
  categories: { value: string; label: string }[];
  shops: { value: string; label: string }[];
}> {
  const [categories, vendors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.vendor.findMany({
      where: { verificationStatus: "verified" },
      orderBy: { businessName: "asc" },
      select: { businessName: true, slug: true },
    }),
  ]);
  return {
    categories: [
      { value: "all", label: "All categories" },
      ...categories.map((c) => ({ value: c.slug, label: c.name })),
    ],
    shops: [
      { value: "all", label: "All shops" },
      ...vendors.map((v) => ({ value: v.slug, label: v.businessName })),
    ],
  };
}
