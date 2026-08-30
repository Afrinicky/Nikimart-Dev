/**
 * Preorder terms — the arrangement a buyer is agreeing to.
 *
 * A preorder is not a purchase of something that exists. The buyer is paying
 * now for an item that will be sourced, shipped and handed over weeks later,
 * on terms that vary per listing: when it should arrive, how much of the price
 * is due up front, what happens to their money if it does not come. Those
 * terms are the product, as much as the item is, so they have to be the
 * seller's to write and the buyer's to read before paying.
 *
 * The shape already existed and was already rendered on the product page, but
 * nothing could write it — `buildProductData` never touched the column, so the
 * only preorder terms in the system were the ones in the seed data. This module
 * is the parse and serialise either side of that gap.
 *
 * Pure, with no imports, so it is unit-tested directly and safe to use from a
 * client form and a server action alike.
 */

export type PreorderDepositType = "percentage" | "fixed_amount";

export interface PreorderTerms {
  /** When the buyer should expect it, in the seller's own words. */
  estimatedArrival: string;
  /** When the preorder window shuts. */
  closingDate: string;
  depositRequired: boolean;
  depositType: PreorderDepositType;
  /** Percent of the price, or an amount in GH₵, depending on depositType. */
  depositValue: number;
  /** How and when the rest is paid. */
  balanceInstruction: string;
  /** What happens if it is late, cancelled, or never arrives. */
  refundPolicy: string;
  /** Where it is being sourced from. */
  sourceLocation: string;
  /** Orders needed before the batch ships. 0 = no minimum. */
  minimumOrders: number;
}

export const EMPTY_PREORDER_TERMS: PreorderTerms = {
  estimatedArrival: "",
  closingDate: "",
  depositRequired: false,
  depositType: "percentage",
  depositValue: 0,
  balanceInstruction: "",
  refundPolicy: "",
  sourceLocation: "",
  minimumOrders: 0,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Read stored terms. Returns null when there is nothing usable, so a caller can
 * tell "this seller wrote terms" from "this listing has none" — the difference
 * decides whether checkout shows a panel or stays quiet.
 */
export function parsePreorderTerms(raw: string | null | undefined): PreorderTerms | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const o = parsed as Record<string, unknown>;
  const depositValue = count(o.depositValue);
  const terms: PreorderTerms = {
    estimatedArrival: text(o.estimatedArrival),
    closingDate: text(o.closingDate),
    // A deposit that was flagged but priced at zero is not a deposit. Treating
    // it as one would show a buyer "Deposit: 0%" and imply a part-payment the
    // seller never asked for.
    depositRequired: Boolean(o.depositRequired) && depositValue > 0,
    depositType: o.depositType === "fixed_amount" ? "fixed_amount" : "percentage",
    depositValue,
    balanceInstruction: text(o.balanceInstruction),
    refundPolicy: text(o.refundPolicy),
    sourceLocation: text(o.sourceLocation),
    minimumOrders: count(o.minimumOrders),
  };

  return hasAnyTerms(terms) ? terms : null;
}

/** True when at least one term says something a buyer could act on. */
export function hasAnyTerms(terms: PreorderTerms): boolean {
  return Boolean(
    terms.estimatedArrival ||
      terms.closingDate ||
      terms.balanceInstruction ||
      terms.refundPolicy ||
      terms.sourceLocation ||
      terms.depositRequired ||
      terms.minimumOrders > 0,
  );
}

/**
 * Serialise for storage. Returns null for terms with nothing in them, so an
 * untouched form clears the column instead of storing an empty husk that
 * `parsePreorderTerms` would then have to recognise as meaningless.
 */
export function serialisePreorderTerms(terms: PreorderTerms): string | null {
  const clean: PreorderTerms = {
    estimatedArrival: terms.estimatedArrival.trim(),
    closingDate: terms.closingDate.trim(),
    depositValue: count(terms.depositValue),
    depositRequired: Boolean(terms.depositRequired) && count(terms.depositValue) > 0,
    depositType: terms.depositType === "fixed_amount" ? "fixed_amount" : "percentage",
    balanceInstruction: terms.balanceInstruction.trim(),
    refundPolicy: terms.refundPolicy.trim(),
    sourceLocation: terms.sourceLocation.trim(),
    minimumOrders: count(terms.minimumOrders),
  };
  return hasAnyTerms(clean) ? JSON.stringify(clean) : null;
}

/**
 * The deposit due on one line, or null when the whole price is due now.
 *
 * Rounded to the pesewa, and never more than the price itself — a fixed deposit
 * left over from a higher price must not ask for more than the item costs.
 */
export function depositDue(terms: PreorderTerms, unitPrice: number, quantity = 1): number | null {
  if (!terms.depositRequired || terms.depositValue <= 0) return null;
  const line = unitPrice * quantity;
  const raw =
    terms.depositType === "percentage"
      ? (line * terms.depositValue) / 100
      : terms.depositValue * quantity;
  return Math.round(Math.min(raw, line) * 100) / 100;
}

/** One line summarising the deposit, for a buyer. */
export function describeDeposit(terms: PreorderTerms): string {
  if (!terms.depositRequired || terms.depositValue <= 0) return "Paid in full at checkout";
  return terms.depositType === "percentage"
    ? `${terms.depositValue}% deposit`
    : `GH₵${terms.depositValue} deposit`;
}

/**
 * Adapt the catalogue's parsed `PreorderInfo` into the editor's shape.
 *
 * `PreorderInfo` (lib/types) is what the storefront reads; it carries a
 * `preorderStatus` the seller does not set by hand and leaves `minimumOrders`
 * optional. This narrows it to exactly the fields the form owns, so the editor
 * never silently drops or invents anything.
 */
export function toPreorderTerms(info: {
  estimatedArrival?: string;
  closingDate?: string;
  depositRequired?: boolean;
  depositType?: string;
  depositValue?: number;
  balanceInstruction?: string;
  refundPolicy?: string;
  sourceLocation?: string;
  minimumOrders?: number;
}): PreorderTerms {
  return parsePreorderTerms(JSON.stringify(info)) ?? EMPTY_PREORDER_TERMS;
}
