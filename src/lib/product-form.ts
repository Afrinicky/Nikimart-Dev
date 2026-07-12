// Shared (non-server) helpers for building product data from a submitted form.
// Imported by both the admin and seller product server actions so the parsing
// and validation stay in one place.

import { z } from "zod";
import type { KeyAttribute } from "@/lib/types";

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

/** Reads the gallery image URLs submitted as a JSON string in the `images` field. */
export function parseImages(fd: FormData): string[] {
  try {
    const arr = JSON.parse(str(fd, "images") || "[]");
    if (Array.isArray(arr)) return arr.filter((u) => typeof u === "string" && u.length > 0);
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

/**
 * Builds the scalar Product fields from the form. `vendorId` can be forced
 * (seller flow) regardless of the submitted value.
 */
export function buildProductData(fd: FormData, forceVendorId?: string) {
  const name = str(fd, "name");
  const images = parseImages(fd);
  return {
    name,
    slug: optStr(fd, "slug") ? slugify(str(fd, "slug")) : slugify(name),
    description: str(fd, "description"),
    price: num(fd, "price") ?? 0,
    oldPrice: num(fd, "oldPrice") ?? null,
    stockQuantity: num(fd, "stockQuantity") ?? 0,
    productType: str(fd, "productType") || "in_stock",
    categoryId: str(fd, "categoryId"),
    vendorId: forceVendorId ?? str(fd, "vendorId"),
    emoji: optStr(fd, "emoji") ?? "🛍️",
    // Keep the single `image` column in sync with the primary gallery image.
    image: images[0] ?? null,
    gradientFrom: optStr(fd, "gradientFrom") ?? "#0e1f36",
    gradientTo: optStr(fd, "gradientTo") ?? "#07111f",
    badges: JSON.stringify(csv(fd, "badges")),
    locationIds: JSON.stringify(csv(fd, "locationIds").length ? csv(fd, "locationIds") : ["any"]),
    attributes: JSON.stringify(parseAttributes(fd)),
    isFeatured: bool(fd, "isFeatured"),
    isOfficial: bool(fd, "isOfficial"),
    pickupAvailable: bool(fd, "pickupAvailable"),
    campusDeliveryAvailable: bool(fd, "campusDeliveryAvailable"),
    sameDayDeliveryAvailable: bool(fd, "sameDayDeliveryAvailable"),
  };
}
