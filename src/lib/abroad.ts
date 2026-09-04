/**
 * Shipped from Abroad — the arrangement a buyer is agreeing to.
 *
 * A seller finds an item on Alibaba (or anywhere), copies its details and link,
 * lists it here, and it is bought, freighted and handed over weeks later.
 * Nothing closes — the listing stays open — so what the buyer needs is the
 * *promise*: where it comes from, when it should arrive, what happens if it
 * does not, and how they pay.
 *
 * The *money* is not in here. Which forwarder carries it, on which lane, into
 * which of their Ghana warehouses — those live in real columns on Product and
 * are priced by `lib/shipping`, because they have to be queried, joined and
 * re-priced on the server. What is left in this JSON is what a seller promises
 * in words, and the handful of per-listing numbers that only make sense beside
 * those words.
 *
 * Two arrangements exist, and the split runs through everything:
 *
 *   1. **The supplier delivers.** Their price already puts the goods at a Ghana
 *      consolidation point. Nothing is charged to bring them in; the buyer pays
 *      the local run from that point to the station they choose.
 *   2. **A forwarder carries it.** The supplier only reaches the forwarder's
 *      warehouse abroad — the buyer pays that hop — and the lane's rate per
 *      cubic metre covers the rest.
 *
 * Pure, with no imports beyond types, so the same parse and serialise run in a
 * client form and a server action alike, and are unit-tested directly.
 */

export {
  FREIGHT_MODES,
  FREIGHT_MODE_LABELS,
  freightModeLabel,
  isFreightMode,
  type FreightMode,
} from "./shipping.ts";

/** Short seller-facing note on what each mode means for the wait. */
export const FREIGHT_MODE_HINTS: Record<string, string> = {
  air: "Faster, dearer per cubic metre.",
  sea: "Cheapest for bulk, and the slowest.",
  road: "Regional overland freight.",
  express: "Door-to-door courier, fastest and dearest.",
};

export interface AbroadTerms {
  // --- Sourcing: where the seller found it --------------------------------
  /** The listing the seller copied from (Alibaba, 1688, Amazon…). */
  sourceUrl: string;
  /** The supplier's name or shop, as the seller knows it. */
  supplierName: string;
  /** How the supplier is reached: phone, WeChat, email. */
  supplierContact: string;
  /** Where it ships from, in words: "Guangzhou, China". */
  sourceLocation: string;
  /** Origin country code (CN, AE, US…). Blank inherits the shop's. */
  originCountry: string;

  // --- Timing: nothing closes, but the wait is stated ---------------------
  /** When the buyer should expect it, in the seller's own words. */
  estimatedArrival: string;
  /** Days the supplier needs before the goods reach the forwarder. */
  processingDays: number;
  /** Orders needed before the seller places the batch. 0 = no minimum. */
  minimumOrders: number;

  // --- The route ----------------------------------------------------------
  /**
   * True when the supplier's price already puts the goods at the Ghana
   * consolidation point. Arrangement 1: nothing is charged for the
   * international leg, and the local system takes over from that point.
   */
  supplierDelivers: boolean;
  /** The forwarder carrying the international leg. Arrangement 2. */
  forwarderId: string;
  /** The Ghana consolidation point this listing lands at. */
  consolidationPointId: string;
  /** The forwarder's lane — the mode into that point — this is quoted on. */
  routeId: string;
  /** GH₵ per unit to get the goods to the forwarder abroad. The buyer pays it. */
  supplierFreight: number;

  // --- Money ---------------------------------------------------------------
  //
  // There is no deposit and no part-payment for the goods. A buyer pays the
  // full item price at checkout, because that is the money the seller spends
  // the moment they place the order with the supplier. Whether the *shipping*
  // may be settled at collection is a per-listing choice, and it lives on the
  // Product row (`shippingOnPickup`) rather than here.
  /** How and when the shipping is settled, when it is left until collection. */
  balanceInstruction: string;
  /** What happens if it is late, cancelled, or never arrives. */
  refundPolicy: string;
}

export const EMPTY_ABROAD_TERMS: AbroadTerms = {
  sourceUrl: "",
  supplierName: "",
  supplierContact: "",
  sourceLocation: "",
  originCountry: "",
  estimatedArrival: "",
  processingDays: 0,
  minimumOrders: 0,
  supplierDelivers: false,
  forwarderId: "",
  consolidationPointId: "",
  routeId: "",
  supplierFreight: 0,
  balanceInstruction: "",
  refundPolicy: "",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A non-negative number, or 0. Used for money and counts. */
function count(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to the pesewa. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A source link we are willing to render and follow. Only absolute http(s):
 * anything else — `javascript:`, `data:`, a protocol-relative `//evil.tld` —
 * is dropped, because this URL ends up in an anchor on a public product page
 * and in the admin's order-placement queue.
 */
export function isSafeSourceUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.length > 2000) return false;
  if (value.startsWith("//")) return false;
  return /^https?:\/\//i.test(value);
}

/**
 * Read stored terms. Returns null when there is nothing usable, so a caller can
 * tell "this seller wrote terms" from "this listing has none" — the difference
 * decides whether the product page and checkout show a panel or stay quiet.
 *
 * Older shapes parse too, and this is where they are reconciled. A listing
 * written under a previous system carries `arrivalPointId` for its
 * consolidation point and `freightIncluded` for what is now `supplierDelivers`;
 * both meant the same thing and both are read. Nothing is backfilled — the code
 * is what reconciles them, per db/migrations/README.md.
 */
export function parseAbroadTerms(raw: string | null | undefined): AbroadTerms | null {
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
  const sourceUrl = text(o.sourceUrl);

  const terms: AbroadTerms = {
    sourceUrl: isSafeSourceUrl(sourceUrl) ? sourceUrl : "",
    supplierName: text(o.supplierName),
    supplierContact: text(o.supplierContact),
    sourceLocation: text(o.sourceLocation),
    originCountry: text(o.originCountry).toUpperCase().slice(0, 2),
    estimatedArrival: text(o.estimatedArrival),
    processingDays: Math.round(count(o.processingDays)),
    minimumOrders: Math.round(count(o.minimumOrders)),
    // "freightIncluded" is the old name for the same promise: the price already
    // reaches Ghana.
    supplierDelivers: Boolean(o.supplierDelivers) || Boolean(o.freightIncluded),
    forwarderId: text(o.forwarderId),
    consolidationPointId: text(o.consolidationPointId) || text(o.arrivalPointId),
    routeId: text(o.routeId),
    supplierFreight: money(count(o.supplierFreight)),
    // Deposits are gone: the goods are paid for in full at checkout. So are the
    // per-listing duty and tax rates — a forwarder's rate per cubic metre is
    // the whole cost of the leg, and charging tax on top of it billed twice.
    balanceInstruction: text(o.balanceInstruction),
    refundPolicy: text(o.refundPolicy),
  };

  return hasAnyTerms(terms) ? terms : null;
}

/** True when at least one term says something a buyer could act on. */
export function hasAnyTerms(terms: AbroadTerms): boolean {
  return Boolean(
    terms.estimatedArrival ||
      terms.sourceLocation ||
      terms.sourceUrl ||
      terms.supplierName ||
      terms.supplierContact ||
      terms.originCountry ||
      terms.consolidationPointId ||
      terms.forwarderId ||
      terms.routeId ||
      terms.balanceInstruction ||
      terms.refundPolicy ||
      terms.supplierDelivers ||
      terms.supplierFreight > 0 ||
      terms.minimumOrders > 0,
  );
}

/**
 * Serialise for storage. Returns null for terms with nothing in them, so an
 * untouched form clears the column instead of storing an empty husk that
 * `parseAbroadTerms` would then have to recognise as meaningless.
 */
export function serialiseAbroadTerms(terms: AbroadTerms): string | null {
  const clean = parseAbroadTerms(JSON.stringify(terms));
  return clean ? JSON.stringify(clean) : null;
}

/**
 * Adapt a parsed catalogue object into the editor's shape.
 *
 * The storefront reads a loosely-typed object off the JSON column (it may be a
 * legacy record); this narrows it to exactly the fields the form owns, so the
 * editor never silently drops or invents anything.
 */
export function toAbroadTerms(info: object): AbroadTerms {
  return parseAbroadTerms(JSON.stringify(info)) ?? EMPTY_ABROAD_TERMS;
}

// ---------------------------------------------------------------------------
// The product type, and its legacy name
// ---------------------------------------------------------------------------

/**
 * The stored `productType` for a shipped-from-abroad listing.
 *
 * Every such listing created before this feature was stored as `"preorder"`,
 * and migrations here are additive by rule — no backfills, no UPDATEs. So both
 * values mean the same thing and the code, not the database, is what
 * reconciles them: read with `isAbroadType`, query with `ABROAD_TYPES`, write
 * with `SHIPPED_FROM_ABROAD`.
 */
export const SHIPPED_FROM_ABROAD = "shipped_from_abroad";

/** The legacy value. Still on every listing created before the rename. */
export const LEGACY_PREORDER_TYPE = "preorder";

/** Every stored value that means "shipped from abroad", for `in` queries. */
export const ABROAD_TYPES = [SHIPPED_FROM_ABROAD, LEGACY_PREORDER_TYPE] as const;

/** True when a stored productType is a shipped-from-abroad listing. */
export function isAbroadType(productType: string | null | undefined): boolean {
  return productType === SHIPPED_FROM_ABROAD || productType === LEGACY_PREORDER_TYPE;
}

/** Normalise a stored productType to the current value. */
export function normaliseProductType(productType: string | null | undefined): string {
  if (isAbroadType(productType)) return SHIPPED_FROM_ABROAD;
  return productType || "in_stock";
}
