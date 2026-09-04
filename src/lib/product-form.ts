// Shared (non-server) helpers for building product data from a submitted form.
// Imported by both the admin and seller product server actions so the parsing
// and validation stay in one place.

import { z } from "zod";
import type { KeyAttribute } from "@/lib/types";
// Relative, not aliased: this module is unit-tested by `node --test` with no
// bundler, so a real (non-type-only) import has to resolve without tsconfig
// path mapping. The type-only import above is erased and can stay aliased.
import {
  isAbroadType,
  parseAbroadTerms,
  serialiseAbroadTerms,
  SHIPPED_FROM_ABROAD,
} from "./abroad.ts";
import { cbmFromDimensions, isShippingMethod, normaliseMoq } from "./shipping.ts";

export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | undefined {
  const v = str(fd, key);
  return v ? v : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
function csv(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const productSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  description: z.string().trim().min(1, "Description is required."),
  price: z.number({ message: "Price is required." }).min(0, "Price must be ≥ 0."),
  categoryId: z.string().trim().min(1, "Choose a category."),
  vendorId: z.string().trim().min(1, "Choose a shop."),
});

export function validateProduct(fd: FormData) {
  return productSchema.safeParse({
    name: str(fd, "name"),
    description: str(fd, "description"),
    price: num(fd, "price"),
    categoryId: str(fd, "categoryId"),
    vendorId: str(fd, "vendorId"),
  });
}

/**
 * True for image sources we're willing to render: absolute http(s) URLs, images
 * served from /public, and base64 image data URLs (device uploads). Anything
 * else — `javascript:`, `data:text/html`, protocol-relative `//evil.tld` — is
 * dropped, so a crafted form submission can't plant an active-content URL that
 * later renders inside an <img src>.
 */
export function isSafeImageUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.length > 5_000_000) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(value)) {
    // Inline SVG can carry script; only raster data URLs are accepted.
    return !/^data:image\/svg/i.test(value);
  }
  return /^https?:\/\//i.test(value);
}

/** Reads the gallery image URLs submitted as a JSON string in the `images` field. */
export function parseImages(fd: FormData): string[] {
  try {
    const arr = JSON.parse(str(fd, "images") || "[]");
    if (Array.isArray(arr)) {
      return arr.filter((u): u is string => typeof u === "string" && isSafeImageUrl(u));
    }
  } catch {
    // ignore
  }
  return [];
}

/** Reads key attributes submitted as a JSON string in the `attributes` field. */
export function parseAttributes(fd: FormData): KeyAttribute[] {
  try {
    const arr = JSON.parse(str(fd, "attributes") || "[]");
    if (Array.isArray(arr)) {
      return arr
        .filter((a) => a && typeof a.label === "string" && typeof a.value === "string")
        .map((a) => ({ label: a.label.trim(), value: a.value.trim() }))
        .filter((a) => a.label && a.value);
    }
  } catch {
    // ignore
  }
  return [];
}

export interface BuildProductOptions {
  /** Forces the owning shop (seller flow) regardless of the submitted value. */
  vendorId?: string;
  /**
   * Who is submitting. Sellers can only enrol a product in the affiliate
   * programme at their own expense; only admins can put it on the platform's
   * tab (`affiliateFundedBy=admin`).
   */
  actor?: "admin" | "seller";
}

/** Reads the affiliate-enrolment fields, respecting who is submitting them. */
function affiliateFields(fd: FormData, actor: "admin" | "seller") {
  const enabled = bool(fd, "affiliateEnabled");
  if (!enabled) {
    return { affiliateEnabled: false, affiliateEnrolledBy: "", affiliateCommissionRate: null };
  }
  const requestedFunder = str(fd, "affiliateFundedBy");
  const enrolledBy = actor === "admin" && requestedFunder === "admin" ? "admin" : "seller";
  const rate = num(fd, "affiliateCommissionRate");
  return {
    affiliateEnabled: true,
    affiliateEnrolledBy: enrolledBy,
    // Blank → null → inherit the category rate, then the programme default.
    affiliateCommissionRate:
      rate !== undefined && rate >= 0 && rate <= 100 ? Math.round(rate * 100) / 100 : null,
  };
}

/**
 * How this listing ships, mirrored out of the form and the submitted terms.
 *
 * The terms are one JSON blob, which is the right shape for a panel a buyer
 * reads top to bottom and the wrong shape for a query. So the fields the rest
 * of the system needs to filter, join or price on are unpacked into real
 * columns here, from the same submitted JSON — one source, parsed once, so a
 * column can never disagree with the terms it came from.
 *
 * A product that is not imported gets every import field cleared. Switching a
 * listing away from that type has to leave nothing behind: a stale forwarder on
 * an in-stock item would quietly bill somebody for a sea container.
 */
function shippingFields(fd: FormData) {
  const productType = str(fd, "productType") || "in_stock";
  const abroad = isAbroadType(productType);
  const terms = abroad ? parseAbroadTerms(str(fd, "abroadTerms")) : null;

  const method = str(fd, "shippingMethod");
  const local = {
    shippingMethod: isShippingMethod(method) ? method : "auto",
    // Only ever charged on the manual method; stored at zero otherwise so a
    // listing switched back to standard pricing cannot keep a stale fee.
    manualShippingFee: isShippingMethod(method) && method === "manual" ? (num(fd, "manualShippingFee") ?? 0) : 0,
    // The checkbox is absent when the option is switched off platform-wide or
    // the listing ships free, and absent means no.
    shippingOnPickup: bool(fd, "shippingOnPickup"),
    shippingWeightKg: num(fd, "shippingWeightKg") ?? 0.5,
    lengthCm: num(fd, "lengthCm") ?? 0,
    widthCm: num(fd, "widthCm") ?? 0,
    heightCm: num(fd, "heightCm") ?? 0,
    // Prefer the entered volume; otherwise derive it from L×W×H. Only the leg
    // from abroad is priced on it, but it is cheap to keep current.
    cbm: (() => {
      const direct = num(fd, "cbm");
      if (direct && direct > 0) return Math.round(direct * 1_000_000) / 1_000_000;
      return cbmFromDimensions(num(fd, "lengthCm") ?? 0, num(fd, "widthCm") ?? 0, num(fd, "heightCm") ?? 0);
    })(),
  };

  if (!terms) {
    return {
      ...local,
      // Normalise the stored type: new and edited listings use the current
      // value, while untouched legacy "preorder" rows keep theirs.
      productType: abroad ? SHIPPED_FROM_ABROAD : productType,
      // Cleared, not carried over. The form blanks the hidden field when the
      // section is hidden, but a submission is a claim from a browser: a
      // handcrafted one must not be able to leave freight terms on an in-stock
      // item, where nothing would display them and the pricing would still
      // find them.
      preorderInfo: null,
      originCountry: "",
      sourceUrl: "",
      supplierName: "",
      supplierContact: "",
      freightMode: "",
      supplierFreight: 0,
      supplierDelivers: false,
      forwarderId: null,
      forwarderRouteId: null,
      // A local listing states its consolidation point directly; an imported
      // one carries it inside the terms.
      arrivalPointId: str(fd, "consolidationPointId") || null,
    };
  }

  return {
    ...local,
    productType: SHIPPED_FROM_ABROAD,
    // Stored as the parser produced it, not as it arrived: one normalised
    // shape in the column, so a legacy record re-saved through the form comes
    // back out in the current shape rather than half of each.
    preorderInfo: serialiseAbroadTerms(terms),
    originCountry: terms.originCountry,
    sourceUrl: terms.sourceUrl,
    supplierName: terms.supplierName,
    supplierContact: terms.supplierContact,
    // Mirrored from the lane the seller chose, so the order-placement queue and
    // the storefront can filter on it without joining three tables.
    freightMode: str(fd, "freightMode"),
    supplierFreight: terms.supplierFreight,
    supplierDelivers: terms.supplierDelivers,
    forwarderId: terms.forwarderId || null,
    forwarderRouteId: terms.routeId || null,
    arrivalPointId: terms.consolidationPointId || null,
  };
}

/**
 * Builds the scalar Product fields from the form. `vendorId` can be forced
 * (seller flow) regardless of the submitted value.
 */
export function buildProductData(fd: FormData, options: BuildProductOptions = {}) {
  const { vendorId: forceVendorId, actor = "admin" } = options;
  const name = str(fd, "name");
  const images = parseImages(fd);
  return {
    ...affiliateFields(fd, actor),
    name,
    slug: optStr(fd, "slug") ? slugify(str(fd, "slug")) : slugify(name),
    description: str(fd, "description"),
    price: num(fd, "price") ?? 0,
    oldPrice: num(fd, "oldPrice") ?? null,
    stockQuantity: num(fd, "stockQuantity") ?? 0,
    // The minimum a buyer may order. Normalised rather than trusted: a zero or
    // a fraction from a handcrafted submission would make "at least none" a
    // rule the cart, the product page and checkout each had to interpret.
    moq: normaliseMoq(num(fd, "moq")),
    // How it ships: the method, the size it is billed on, and — for an imported
    // listing — the columns mirrored out of its terms, `preorderInfo` included.
    // That column keeps its old name; see lib/abroad.
    ...shippingFields(fd),
    categoryId: str(fd, "categoryId"),
    vendorId: forceVendorId ?? str(fd, "vendorId"),
    emoji: optStr(fd, "emoji") ?? "🛍️",
    // Keep the single `image` column in sync with the primary gallery image.
    image: images[0] ?? null,
    gradientFrom: optStr(fd, "gradientFrom") ?? "#1f1f1f",
    gradientTo: optStr(fd, "gradientTo") ?? "#131313",
    badges: JSON.stringify(csv(fd, "badges")),
    locationIds: JSON.stringify(csv(fd, "locationIds").length ? csv(fd, "locationIds") : ["any"]),
    attributes: JSON.stringify(parseAttributes(fd)),
    // NB: affiliate enrolment is set once, by affiliateFields() spread at the
    // top of this object. It used to be set a second time down here alongside
    // an `affiliateCommission` number — a column Product does not have (it is
    // on Order and OrderItem; Product's is `affiliateCommissionRate`). Prisma
    // rejects an unknown argument outright, so that one stray key failed every
    // product create and update from both the admin and the seller console,
    // whatever the edit was.
    isFeatured: bool(fd, "isFeatured"),
    isOfficial: bool(fd, "isOfficial"),
    pickupAvailable: bool(fd, "pickupAvailable"),
    campusDeliveryAvailable: bool(fd, "campusDeliveryAvailable"),
    sameDayDeliveryAvailable: bool(fd, "sameDayDeliveryAvailable"),
  };
}
