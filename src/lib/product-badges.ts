import { isAbroadType } from "@/lib/abroad";
import { isAbroad } from "@/lib/countries";
import type { BadgeKind, Product } from "@/lib/types";

/**
 * The badges a product card actually shows.
 *
 * `product.badges` is a free-text list somebody typed into a comma-separated
 * field, which is fine for promotional labels ("Flash Sale", "Limited Stock")
 * and useless for facts the system already knows. Shipped-from-abroad was in
 * the second category and was being treated as the first: a seller had to
 * remember to type `shipped_from_abroad` into a badges box, and the listing
 * they had just marked as imported showed no sign of it anywhere on the card.
 *
 * So the badge is derived, and derived first — it is the single most important
 * thing about the listing, because it is the difference between "this arrives
 * tomorrow" and "this arrives in six weeks". Typed badges follow, deduped
 * against it so a seller who did remember doesn't get it twice.
 */
export function productBadges(
  product: Pick<Product, "badges" | "productType" | "originCountry">,
): BadgeKind[] {
  const typed = product.badges ?? [];
  // Either signal is enough: the product type is what the seller chose in the
  // form, and a foreign origin catches listings imported from a foreign shop
  // without the type being set.
  const abroad = isAbroadType(product.productType) || isAbroad(product.originCountry);
  if (!abroad) return typed;

  // "imported_item" said the same thing in older words. Dropping it keeps the
  // card from carrying two badges that mean one fact.
  const rest = typed.filter((b) => b !== "shipped_from_abroad" && b !== "imported_item");
  return ["shipped_from_abroad", ...rest];
}
