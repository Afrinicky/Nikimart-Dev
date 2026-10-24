/**
 * What a customer may actually do with a product.
 *
 * Three inputs decide it and they interact, which is why this is a module with
 * a test rather than a condition written out at each of the six places that
 * needs it — a product page, a card, a category grid, a search result, the
 * cart, and the server action that has to reject what the button should not
 * have offered.
 *
 *   purchaseMode   CHECKOUT | QUOTATION | BOTH, set by an administrator.
 *   availability   what the stock figure was turned into.
 *   restrictedSale whether a licence or an institutional account is required.
 *
 * The rules, in the order they bite:
 *
 *   1. A restricted line is never bought with a card by somebody who walked in
 *      off the internet. Whatever its mode says, it is quotation-only — the
 *      point of the restriction is that a person checks before it ships.
 *   2. Nothing out of stock goes in a cart. Asking for a quotation on it is
 *      still useful: that is how a customer says "get me some".
 *   3. A line brought in to order can be checked out when its mode allows it,
 *      because the lead time on the page already says it will take a fortnight.
 *
 * Pure, so it can be tested and so the server action and the button cannot
 * disagree about what is allowed.
 */

import type { Availability, PurchaseMode } from "@/lib/medical/catalogue";

export interface PurchaseOptions {
  /** Whether "Add to cart" may be offered at all. */
  canCheckout: boolean;
  /** Whether "Request a quotation" may be offered. */
  canQuote: boolean;
  /**
   * Which of the two is the page's primary button. Null when neither is
   * available, which is a product that can only be looked at.
   */
  primary: "CHECKOUT" | "QUOTATION" | null;
  /**
   * Why checkout is unavailable, when it is and the mode alone does not
   * explain it. Shown next to the quotation button so the customer is not left
   * wondering where the buy button went.
   */
  checkoutBlockedBecause: "OUT_OF_STOCK" | "RESTRICTED" | null;
}

export function purchaseOptions(product: {
  purchaseMode: PurchaseMode;
  availability: Availability;
  restrictedSale: boolean;
}): PurchaseOptions {
  const { purchaseMode, restrictedSale } = product;
  const kind = product.availability.kind;
  const outOfStock = kind === "OUT_OF_STOCK";

  const modeAllowsCheckout = purchaseMode === "CHECKOUT" || purchaseMode === "BOTH";
  const modeAllowsQuote = purchaseMode === "QUOTATION" || purchaseMode === "BOTH";

  const canCheckout = modeAllowsCheckout && !restrictedSale && !outOfStock;

  // A quotation is always worth offering on something that cannot be bought,
  // even where the administrator set the product to checkout-only: "we would
  // like 40 of these, when can you get them" is the most valuable message this
  // business receives, and the alternative is a dead end.
  const canQuote = modeAllowsQuote || !canCheckout;

  const checkoutBlockedBecause = canCheckout
    ? null
    : restrictedSale && modeAllowsCheckout
      ? "RESTRICTED"
      : outOfStock && modeAllowsCheckout
        ? "OUT_OF_STOCK"
        : null;

  return {
    canCheckout,
    canQuote,
    primary: canCheckout ? "CHECKOUT" : canQuote ? "QUOTATION" : null,
    checkoutBlockedBecause,
  };
}

/** The words on the primary button. */
export function primaryActionLabel(options: PurchaseOptions): string {
  if (options.primary === "CHECKOUT") return "Add to cart";
  if (options.primary === "QUOTATION") return "Add to quotation";
  return "Unavailable";
}

/**
 * The one line under the price that says how this product is bought.
 *
 * Only where it is not obvious. A product with an add-to-cart button and stock
 * needs no explanation, and a sentence under every price is noise that trains
 * people to stop reading the ones that matter.
 */
export function purchaseNote(
  options: PurchaseOptions,
  availability: Availability,
  /**
   * The listed price in pesewas. It changes what the note may truthfully say:
   * "Priced on request" printed directly beneath a price of GH₵8,450 is a
   * contradiction a customer notices immediately, and the first thing they
   * then distrust is the price.
   */
  price = 0,
): string | null {
  if (options.checkoutBlockedBecause === "RESTRICTED") {
    return "Sold to licensed institutions. Add it to your quotation list and we will confirm.";
  }
  if (options.checkoutBlockedBecause === "OUT_OF_STOCK") {
    return "Out of stock. Add it to your quotation list and we will tell you when we can supply.";
  }
  if (!options.canCheckout && options.canQuote) {
    if (price <= 0) return "Priced on request.";
    return availability.kind === "TO_ORDER"
      ? "Brought in to order. The price above is indicative — we will confirm it with the lead time."
      : "Ordered by quotation. The price above is indicative until we confirm it with lead time and terms.";
  }
  return null;
}

/** "2–7 working days", or "2 working days" when both ends agree. */
export function formatLeadTime(leadTime: { min: number; max: number }): string {
  const { min, max } = leadTime;
  if (min <= 0 && max <= 0) return "Lead time on request";
  if (min === max) return `${min} working day${min === 1 ? "" : "s"}`;
  return `${min}–${max} working days`;
}

export const AVAILABILITY_LABEL: Record<Availability["kind"], string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  TO_ORDER: "To order",
  OUT_OF_STOCK: "Out of stock",
};
