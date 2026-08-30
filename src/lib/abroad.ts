/**
 * Shipped from Abroad — the arrangement a buyer is agreeing to.
 *
 * This replaces the old preorder terms. A preorder was "pay now for a batch
 * that closes on a date"; this is dropshipping: a seller finds an item on
 * Alibaba (or anywhere), copies its details and link, lists it here, and it is
 * bought, freighted and handed over weeks later. Nothing closes — the listing
 * stays open — so what the buyer needs instead is the *route* and the *bill*:
 * where it is coming from, how it travels, which Ghana point it lands at, what
 * it costs at each leg, and which of those legs they are paying for today.
 *
 * Freight comes in three legs, and they are billed separately because they are
 * quoted by three different people:
 *
 *   1. Supplier → freight forwarder abroad. The seller knows this; they type it.
 *   2. Forwarder → a Ghana arrival point, by air or sea. Duty and clearing land
 *      here too. The admin configures the points and their rates; the seller
 *      picks one. Some sellers already have this inside their price, which is
 *      what `freightIncluded` says.
 *   3. Ghana arrival point → the buyer's pickup point. That is the existing
 *      CBM route engine, unchanged.
 *
 * Pure, with no imports beyond types, so the same parse/serialise runs in a
 * client form and a server action alike, and is unit-tested directly.
 */

export type DepositType = "percentage" | "fixed_amount";

/** How goods travel from abroad to a Ghana arrival point. */
export type FreightMode = "air" | "sea" | "road" | "express";

export const FREIGHT_MODES: FreightMode[] = ["air", "sea", "road", "express"];

export const FREIGHT_MODE_LABELS: Record<FreightMode, string> = {
  air: "Air freight",
  sea: "Sea freight",
  road: "Road / land freight",
  express: "Express courier",
};

/** Short buyer-facing note on what each mode means for the wait. */
export const FREIGHT_MODE_HINTS: Record<FreightMode, string> = {
  air: "Faster, priced by weight.",
  sea: "Cheapest for bulk, priced by volume (CBM).",
  road: "Regional overland freight.",
  express: "Door-to-door courier, fastest and dearest.",
};

export interface AbroadTerms {
  // --- Sourcing: where the seller found it --------------------------------
  /** The listing the seller copied from (Alibaba, 1688, Amazon…). */
  sourceUrl: string;
  /** The supplier's name or shop, as the seller knows it. */
  supplierName: string;
  /** Where it ships from, in words: "Guangzhou, China". */
  sourceLocation: string;
  /** Origin country code (CN, AE, US, EU…). Blank inherits the shop's. */
  originCountry: string;

  // --- Timing: nothing closes, but the wait is stated ---------------------
  /** When the buyer should expect it, in the seller's own words. */
  estimatedArrival: string;
  /** Days the supplier needs before the goods reach the forwarder. */
  processingDays: number;
  /** Orders needed before the seller places the batch. 0 = no minimum. */
  minimumOrders: number;

  // --- Freight -------------------------------------------------------------
  freightMode: FreightMode;
  /** The admin-configured Ghana point this listing lands at. */
  arrivalPointId: string;
  /** Leg 1, GH₵ per unit: supplier → freight forwarder abroad. */
  supplierFreight: number;
  /**
   * Leg 2 override, GH₵ per unit. 0 means "use the arrival point's rate
   * table", which is the normal case; a seller with their own forwarder deal
   * can pin their own number instead.
   */
  intlFreight: number;
  /** True when legs 1 and 2 are already inside the listed price. */
  freightIncluded: boolean;

  // --- Tax -----------------------------------------------------------------
  /** Sales tax / VAT charged in the country of purchase (percent of goods). */
  originTaxRate: number;
  /**
   * Ghana VAT and levies (percent). Negative means "use the platform rate",
   * which is what almost every listing should do.
   */
  ghanaTaxRate: number;
  /** True when import duty is already covered by the price or by leg 2. */
  dutyIncluded: boolean;

  // --- Money ---------------------------------------------------------------
  depositRequired: boolean;
  depositType: DepositType;
  /** Percent of the price, or an amount in GH₵, depending on depositType. */
  depositValue: number;
  /** How and when the rest is paid. */
  balanceInstruction: string;
  /** What happens if it is late, cancelled, or never arrives. */
  refundPolicy: string;
  /**
   * Whether the buyer may pay for the goods now and settle the freight legs
   * when the item lands. They carry any rate rise in that window; that is the
   * trade and it is spelled out at checkout.
   */
  allowFreightOnArrival: boolean;
}

export const EMPTY_ABROAD_TERMS: AbroadTerms = {
  sourceUrl: "",
  supplierName: "",
  sourceLocation: "",
  originCountry: "",
  estimatedArrival: "",
  processingDays: 0,
  minimumOrders: 0,
  freightMode: "sea",
  arrivalPointId: "",
  supplierFreight: 0,
  intlFreight: 0,
  freightIncluded: false,
  originTaxRate: 0,
  ghanaTaxRate: -1,
  dutyIncluded: false,
  depositRequired: false,
  depositType: "percentage",
  depositValue: 0,
  balanceInstruction: "",
  refundPolicy: "",
  allowFreightOnArrival: false,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A non-negative number, or 0. Used for money, counts and percentages. */
function count(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A rate that is allowed to be "unset" (negative), for the Ghana tax fallback. */
function optionalRate(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return -1;
  return Math.min(n, 100);
}

function mode(value: unknown): FreightMode {
  const v = text(value);
  return (FREIGHT_MODES as string[]).includes(v) ? (v as FreightMode) : "sea";
}

/**
 * A source link we are willing to render and follow. Only absolute http(s):
 * anything else — `javascript:`, `data:`, a protocol-relative `//evil.tld` —
 * is dropped, because this URL ends up in an anchor on a public product page.
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
 * Accepts the legacy preorder shape too. Those listings carry `closingDate`
 * and no freight fields; they parse into the new shape with the freight legs at
 * zero, which is exactly what they were: a price with no route behind it.
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
  const depositValue = count(o.depositValue);
  const sourceUrl = text(o.sourceUrl);

  const terms: AbroadTerms = {
    sourceUrl: isSafeSourceUrl(sourceUrl) ? sourceUrl : "",
    supplierName: text(o.supplierName),
    sourceLocation: text(o.sourceLocation),
    originCountry: text(o.originCountry).toUpperCase().slice(0, 2),
    estimatedArrival: text(o.estimatedArrival),
    processingDays: Math.round(count(o.processingDays)),
    minimumOrders: Math.round(count(o.minimumOrders)),
    freightMode: mode(o.freightMode),
    arrivalPointId: text(o.arrivalPointId),
    supplierFreight: money(count(o.supplierFreight)),
    intlFreight: money(count(o.intlFreight)),
    freightIncluded: Boolean(o.freightIncluded),
    originTaxRate: Math.min(count(o.originTaxRate), 100),
    ghanaTaxRate: optionalRate(o.ghanaTaxRate),
    dutyIncluded: Boolean(o.dutyIncluded),
    // A deposit that was flagged but priced at zero is not a deposit. Treating
    // it as one would show a buyer "Deposit: 0%" and imply a part-payment the
    // seller never asked for.
    depositRequired: Boolean(o.depositRequired) && depositValue > 0,
    depositType: o.depositType === "fixed_amount" ? "fixed_amount" : "percentage",
    depositValue,
    balanceInstruction: text(o.balanceInstruction),
    refundPolicy: text(o.refundPolicy),
    allowFreightOnArrival: Boolean(o.allowFreightOnArrival),
  };

  return hasAnyTerms(terms) ? terms : null;
}

/** Round to the pesewa. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True when at least one term says something a buyer could act on. */
export function hasAnyTerms(terms: AbroadTerms): boolean {
  return Boolean(
    terms.estimatedArrival ||
      terms.sourceLocation ||
      terms.sourceUrl ||
      terms.supplierName ||
      terms.originCountry ||
      terms.arrivalPointId ||
      terms.balanceInstruction ||
      terms.refundPolicy ||
      terms.depositRequired ||
      terms.supplierFreight > 0 ||
      terms.intlFreight > 0 ||
      terms.originTaxRate > 0 ||
      terms.freightIncluded ||
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
 * The deposit due on one line, or null when the whole bill is due now.
 *
 * Rounded to the pesewa, and never more than the amount itself — a fixed
 * deposit left over from a higher price must not ask for more than it costs.
 */
export function depositDue(terms: AbroadTerms, unitPrice: number, quantity = 1): number | null {
  if (!terms.depositRequired || terms.depositValue <= 0) return null;
  const line = unitPrice * quantity;
  const raw =
    terms.depositType === "percentage"
      ? (line * terms.depositValue) / 100
      : terms.depositValue * quantity;
  return money(Math.min(raw, line));
}

/** One line summarising the deposit, for a buyer. */
export function describeDeposit(terms: AbroadTerms): string {
  if (!terms.depositRequired || terms.depositValue <= 0) return "Paid in full at checkout";
  return terms.depositType === "percentage"
    ? `${terms.depositValue}% deposit`
    : `GH₵${terms.depositValue} deposit`;
}

/**
 * Adapt a parsed catalogue object into the editor's shape.
 *
 * The storefront reads a loosely-typed object off the JSON column (it may be a
 * legacy preorder record); this narrows it to exactly the fields the form owns,
 * so the editor never silently drops or invents anything.
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
