/**
 * The Nickimart shipping engine.
 *
 * One module answers one question: what does it cost to put this cart in this
 * buyer's hands at the station they picked?
 *
 * ## Inside Ghana: one consignment per seller
 *
 * Goods are gathered at a **consolidation point** — a seller's Kumasi store, a
 * forwarder's Sunyani warehouse — checked there, and couriered to the **pickup
 * point** the buyer chose.
 *
 * That run is priced the way a courier actually prices one: a **base fee** for
 * the consignment, plus a small **increment** for every unit after the first.
 * And it is charged **per seller**, because a consignment is exactly that —
 * what one shop hands over, moved together. One bottle of spray costs the base
 * fee; ten bottles cost the base fee plus nine increments, not ten base fees.
 *
 * The same rules price the hop out of a forwarder's Ghana warehouse: goods that
 * land in Sunyani and are collected in Hwidiem are one domestic run from that
 * point to that station, and if the buyer collects at the point itself there is
 * nothing left to charge.
 *
 * ## From abroad: the forwarder's own grid
 *
 * A forwarder does not have "a rate". They have a grid, one per Ghana warehouse
 * they run: their **classes of goods** down the side, their **modes** across
 * the top, and a price per cubic metre in each cell — with cells left N/A for
 * the combinations they will not carry. A special levy — appliances, diapers,
 * whatever a customs office has taken an interest in — is a row of that grid
 * like any other, and an item that falls in two rows is carried at both rates
 * added together.
 *
 * That grid is the whole cost of the leg. No platform duty, VAT, clearing fee
 * or fallback rate is added on top of it: whatever the forwarder had to pay at
 * a port is already inside the number they quoted, and charging it again is the
 * easiest way this engine could overcharge somebody.
 *
 * Two arrangements exist and the bill differs:
 *
 *   1. **The supplier delivers.** Their price already reaches a Ghana
 *      consolidation point. Nothing is charged for the international leg; the
 *      buyer pays the local run from there.
 *   2. **A forwarder carries it.** The supplier only reaches the forwarder's
 *      warehouse abroad (the buyer pays that hop), and the lane's rate per
 *      cubic metre brings it the rest of the way.
 *
 * And some things no table should price: a car, a generator, anything fragile
 * enough to need its own arrangement. Those are quoted by hand at listing time.
 *
 * ## Two rules that matter more than the arithmetic
 *
 * **Same point, no fee.** If the goods are already consolidated at the station
 * the buyer picked, there is no journey left to charge for.
 *
 * **The buyer sees one number.** Every leg is computed here and added together.
 * The components survive in the breakdown for the admin console, the seller
 * estimate, payouts and the finance reports — they are just never a row on a
 * buyer's bill.
 *
 * The module is pure — no imports, no `server-only` — so the seller's live
 * estimate, the checkout quote and the order action all run this same code and
 * cannot drift apart. It is unit-tested directly by `node --test`.
 */

// ---------------------------------------------------------------------------
// Weight and volume
// ---------------------------------------------------------------------------

/** Billable weight (kg) assumed for an item that records none. */
export const DEFAULT_ITEM_WEIGHT_KG = 0.5;

/** Fallback per-unit CBM for an imported item with no size recorded (~5 litres). */
export const DEFAULT_ITEM_CBM = 0.005;

/** cm³ per volumetric kilogram. The courier standard; admin-overridable. */
export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;

/** CBM (cubic metres) from centimetre dimensions: L×W×H ÷ 1,000,000. */
export function cbmFromDimensions(lengthCm: number, widthCm: number, heightCm: number): number {
  const vol = (lengthCm || 0) * (widthCm || 0) * (heightCm || 0); // cm³
  return vol > 0 ? Math.round((vol / 1_000_000) * 1_000_000) / 1_000_000 : 0;
}

/** Volumetric ("dimensional") weight in kg from centimetre dimensions. */
export function volumetricWeightKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor = DEFAULT_VOLUMETRIC_DIVISOR,
): number {
  const vol = (lengthCm || 0) * (widthCm || 0) * (heightCm || 0);
  const d = divisor > 0 ? divisor : DEFAULT_VOLUMETRIC_DIVISOR;
  return vol > 0 ? vol / d : 0;
}

export interface ItemSize {
  shippingWeightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  cbm?: number;
}

/**
 * The weight a courier would bill one unit at.
 *
 * The greater of what it weighs and what its size says it weighs, because a
 * duvet and a dumbbell do not cost the same to move despite the scales. Rounded
 * up to the next half kilo, which is how a 600 g parcel comes to be billed as
 * one — couriers charge for the space and the handling, not the gram.
 */
export function billableWeightKg(item: ItemSize, divisor = DEFAULT_VOLUMETRIC_DIVISOR): number {
  const actual = item.shippingWeightKg && item.shippingWeightKg > 0 ? item.shippingWeightKg : 0;
  const volumetric = volumetricWeightKg(
    item.lengthCm ?? 0,
    item.widthCm ?? 0,
    item.heightCm ?? 0,
    divisor,
  );
  const raw = Math.max(actual, volumetric);
  const weight = raw > 0 ? raw : DEFAULT_ITEM_WEIGHT_KG;
  return Math.ceil(weight * 2) / 2;
}

/** The per-unit CBM for the international leg: stored, else derived, else default. */
export function itemCbm(item: ItemSize): number {
  if (typeof item.cbm === "number" && item.cbm > 0) return item.cbm;
  const derived = cbmFromDimensions(item.lengthCm ?? 0, item.widthCm ?? 0, item.heightCm ?? 0);
  return derived > 0 ? derived : DEFAULT_ITEM_CBM;
}

// ---------------------------------------------------------------------------
// The pieces an admin configures
// ---------------------------------------------------------------------------

/** How goods travel from abroad. */
export type FreightMode = "air" | "sea" | "road" | "express";

export const FREIGHT_MODES: FreightMode[] = ["sea", "air", "road", "express"];

export const FREIGHT_MODE_LABELS: Record<FreightMode, string> = {
  air: "Air freight",
  sea: "Sea freight",
  road: "Road freight",
  express: "Express courier",
};

export function isFreightMode(value: string | null | undefined): value is FreightMode {
  return value === "air" || value === "sea" || value === "road" || value === "express";
}

export function freightModeLabel(mode: string | null | undefined): string {
  return FREIGHT_MODE_LABELS[(mode ?? "") as FreightMode] ?? "";
}

/** How a listing's shipping is priced. */
export type ShippingMethod = "auto" | "free" | "manual";

export const SHIPPING_METHODS: ShippingMethod[] = ["auto", "free", "manual"];

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  auto: "Standard — priced automatically",
  free: "Free shipping",
  manual: "Special shipment — I set the fee",
};

export const SHIPPING_METHOD_HINTS: Record<ShippingMethod, string> = {
  auto: "Base fee for the first item, a small increment for each extra one. Freight from abroad is priced by the forwarder's grid.",
  free: "No shipping is charged to any pickup point. You absorb the cost.",
  manual: "For cars, generators, fragile or oversized goods — anything a rate table would price wrongly.",
};

export function isShippingMethod(value: string | null | undefined): value is ShippingMethod {
  return value === "auto" || value === "free" || value === "manual";
}

/** Whether a consolidation point is NikiMart's or a freight forwarder's. */
export type PointKind = "local" | "international";

export function isPointKind(value: string | null | undefined): value is PointKind {
  return value === "local" || value === "international";
}

/**
 * A consolidation point: where a load is brought together and checked.
 *
 * `pickupPointId` is the join that makes the whole system click. When a point
 * sits at a pickup station, a buyer who collects there has nothing to pay — the
 * goods are already in the room — and the fee is zero without anybody
 * configuring a zero.
 *
 * `forwarderId` says whose point it is. A forwarder's Ghana warehouse belongs
 * to them and to nobody else; a point with no forwarder is one of ours.
 */
export interface ConsolidationPoint {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  kind: PointKind;
  /** The forwarder who owns this point. Null = a NikiMart local point. */
  forwarderId: string | null;
  /** The pickup station this point sits at, when it is one. */
  pickupPointId: string | null;
  note: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/** The platform's own currency. Rates typed in it are never converted. */
export const HOME_CURRENCY = "GHS";

/** What forwarders quote in unless they say otherwise. */
export const DEFAULT_FORWARDER_CURRENCY = "USD";

/** An exchange rate: what one unit of `code` is worth in GH₵. */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  rateToGhs: number;
  isActive: boolean;
  /** Whether the daily refresh may overwrite the rate. */
  autoUpdate: boolean;
  /** Where the current figure came from: a provider's host, or "manual". */
  source: string;
}

/** The currencies a fresh install starts with. Rates are indicative, not live. */
export const DEFAULT_CURRENCIES: Currency[] = [
  { code: "GHS", name: "Ghana Cedi", symbol: "GH₵", rateToGhs: 1, isActive: true, autoUpdate: false, source: "" },
  { code: "USD", name: "US Dollar", symbol: "$", rateToGhs: 12, isActive: true, autoUpdate: true, source: "" },
  { code: "EUR", name: "Euro", symbol: "€", rateToGhs: 13, isActive: true, autoUpdate: true, source: "" },
  { code: "GBP", name: "British Pound", symbol: "£", rateToGhs: 15, isActive: true, autoUpdate: true, source: "" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", rateToGhs: 1.7, isActive: true, autoUpdate: true, source: "" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", rateToGhs: 3.3, isActive: true, autoUpdate: true, source: "" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", rateToGhs: 0.35, isActive: true, autoUpdate: true, source: "" },
  { code: "ZAR", name: "South African Rand", symbol: "R", rateToGhs: 0.65, isActive: true, autoUpdate: true, source: "" },
];

/** A code → GH₵-per-unit lookup, which is all the engine needs. */
export type CurrencyRates = Record<string, number>;

export function currencyRatesFrom(list: Currency[]): CurrencyRates {
  const out: CurrencyRates = { [HOME_CURRENCY]: 1 };
  for (const c of list) {
    if (c.rateToGhs > 0) out[c.code.toUpperCase()] = c.rateToGhs;
  }
  return out;
}

/**
 * Convert an amount quoted in `code` into GH₵.
 *
 * An unknown currency converts one-for-one rather than to zero. A rate somebody
 * forgot to enter should quote too little, visibly, not quote a sea container
 * at nothing — and a zero here would be indistinguishable from free shipping.
 */
export function toGhs(amount: number, code: string, rates: CurrencyRates): number {
  if (!amount) return 0;
  const key = (code || HOME_CURRENCY).toUpperCase();
  const rate = rates[key];
  return amount * (rate && rate > 0 ? rate : 1);
}

// ---------------------------------------------------------------------------
// Forwarders: their classes, their lanes and their grid
// ---------------------------------------------------------------------------

/**
 * One of the forwarder's own classes of goods — a row of their grid.
 *
 * Never one of our categories: ours are what a shopper browses, theirs are what
 * a container is priced by.
 *
 * A special levy is a class like any other. "All electrical appliances, $10 a
 * cubic metre" is a row with a rate in it, and a category placed in both
 * "Normal goods" and "All electrical appliances" is carried at the two rates
 * added together. There is deliberately no second levy mechanism: a surcharge
 * written as extra cubic metres and a surcharge written as a rate are the same
 * idea twice, and the pair of them is how a $10 levy once billed a buyer for
 * ten cubic metres of freight.
 */
export interface GoodsClass {
  id: string;
  name: string;
  note: string;
  sortOrder: number;
  /** The class a category with no mapping of its own falls into. */
  isDefault: boolean;
}

/** One cell: what a lane charges per cubic metre for one class. */
export interface RouteRate {
  id: string;
  /** Null = the price for everything with no row of its own. */
  goodsClassId: string | null;
  ratePerCbm: number;
  /** False is the N/A cell: this lane does not carry this class. */
  isAvailable: boolean;
  note: string;
}

/** How often purchases are placed on a lane. */
export type OrderFrequency = "" | "weekly" | "biweekly" | "monthly" | "dates";

export const ORDER_FREQUENCIES: Exclude<OrderFrequency, "">[] = [
  "weekly",
  "biweekly",
  "monthly",
  "dates",
];

export const ORDER_FREQUENCY_LABELS: Record<Exclude<OrderFrequency, "">, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  dates: "Set dates",
};

/** One lane a forwarder sells: one mode into one of their Ghana points. */
export interface ForwarderRoute {
  id: string;
  forwarderId: string;
  /** The column heading. Blank falls back to the mode's own name. */
  name: string;
  /** air | sea | road | express. */
  mode: string;
  /** The forwarder's Ghana point this lane lands at. */
  destinationPointId: string | null;
  /** The currency the rates on this lane are quoted in. */
  currency: string;
  /** The delivery estimate for this mode. */
  minDays: number;
  maxDays: number;
  /** The smallest consignment this lane accepts. Nothing under it ships. */
  minCbm: number;
  /** When purchases are actually placed on this lane. Internal. */
  orderFrequency: string;
  orderFrequencyDetail: string;
  note: string;
  isActive: boolean;
  isDefault: boolean;
  rates: RouteRate[];
}

/** A freight forwarder, and everything they charge for. */
export interface Forwarder {
  id: string;
  name: string;
  code: string;
  /** Basic information: where they are, and who to call. */
  ghanaAddress: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  /** The country they collect in: CN, AE, US… */
  originCountry: string;
  /** Their warehouse abroad — where suppliers dispatch goods to. */
  collectionAddress: string;
  collectionCity: string;
  /** The currency their whole grid is quoted in, unless a lane says otherwise. */
  currency: string;
  note: string;
  /** Their standing notes: levies and quirks. Shown to people, never priced. */
  terms: string;
  isActive: boolean;
  /** Their own consolidation points in Ghana. */
  consolidations: ConsolidationPoint[];
  goodsClasses: GoodsClass[];
  /**
   * Our category id → every one of their class ids it falls into. A category is
   * commonly in two: its base class, and a levy class such as appliances.
   */
  categoryMap: Record<string, string[]>;
  routes: ForwarderRoute[];
}

/**
 * One domestic price, and the scope it applies to.
 *
 * Every part of the scope is optional. A rule with nothing set prices whatever
 * no sharper rule claims; one with a category and a route is the "all blenders,
 * Kumasi to Accra" case. The origin may be a forwarder's Ghana warehouse, which
 * is how the run from a landed consignment to a pickup station is priced.
 */
export interface ShippingRule {
  id: string;
  originPointId: string | null;
  destPickupId: string | null;
  categoryId: string | null;
  baseFee: number;
  perUnitFee: number;
  /** Legacy. Read as the base fee when no base is set. */
  flatFee: number;
  /** Legacy. Read as GH₵ per billable kg of one unit, to derive an increment. */
  perKgRate: number;
  note: string;
  isActive: boolean;
}

/** The platform-wide numbers behind every rule. */
export interface ShippingDefaults {
  /** What one consignment from one seller costs, before the increments. */
  baseFee: number;
  /** What each unit after the first adds. */
  perUnitFee: number;
  /** Legacy GH₵ per billable kilogram, used only to derive an increment. */
  perKgRate: number;
  /** cm³ per volumetric kilogram. */
  volumetricDivisor: number;
  /** No domestic leg is billed under this, once it is billed at all. */
  minFee: number;
}

export const SHIPPING_DEFAULTS: ShippingDefaults = {
  baseFee: 10,
  perUnitFee: 1.5,
  perKgRate: 0,
  volumetricDivisor: DEFAULT_VOLUMETRIC_DIVISOR,
  minFee: 0,
};

/** Everything the engine needs, loaded once per quote. */
export interface ShippingConfig {
  defaults: ShippingDefaults;
  rules: ShippingRule[];
  /** Code → GH₵ per unit. Missing codes convert one-for-one. */
  currencies: CurrencyRates;
}

/** A config with nothing configured — the shape the client forms start from. */
export function emptyShippingConfig(): ShippingConfig {
  return { defaults: { ...SHIPPING_DEFAULTS }, rules: [], currencies: { [HOME_CURRENCY]: 1 } };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** Round a volume to the cubic centimetre, which is as fine as anyone quotes. */
function roundCbm(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * The rule that governs one line's domestic leg, most specific first.
 *
 * A rule scores a point for each part of its scope that names something rather
 * than standing for "any", and the highest score wins. Ties go to the rule that
 * named the category, then the one that named the origin.
 *
 * Null when nothing matches, which is a real answer: the platform defaults
 * price it.
 */
export function resolveRule(
  rules: ShippingRule[],
  scope: { originPointId: string | null; destPickupId: string; categoryId: string },
): ShippingRule | null {
  const matches = rules.filter(
    (r) =>
      r.isActive &&
      (r.originPointId === null || r.originPointId === scope.originPointId) &&
      (r.destPickupId === null || r.destPickupId === scope.destPickupId) &&
      (r.categoryId === null || r.categoryId === scope.categoryId),
  );
  if (matches.length === 0) return null;

  const score = (r: ShippingRule) =>
    (r.originPointId ? 1 : 0) + (r.destPickupId ? 1 : 0) + (r.categoryId ? 1 : 0);

  return matches.reduce((best, r) => {
    const d = score(r) - score(best);
    if (d !== 0) return d > 0 ? r : best;
    if (Boolean(r.categoryId) !== Boolean(best.categoryId)) return r.categoryId ? r : best;
    if (Boolean(r.originPointId) !== Boolean(best.originPointId)) return r.originPointId ? r : best;
    return best;
  });
}

/**
 * What one consignment costs and what each extra unit adds, for one line.
 *
 * The rule's own numbers first, then its legacy ones, then the platform's. An
 * increment is only *derived* from the weight rate when nothing states one
 * directly, which is the same intent expressed in the shape that no longer
 * multiplies.
 */
export function rulePricing(
  rule: ShippingRule | null,
  size: ItemSize,
  defaults: ShippingDefaults,
): { baseFee: number; perUnitFee: number } {
  const unitWeight = billableWeightKg(size, defaults.volumetricDivisor);

  const baseFee = rule
    ? rule.baseFee > 0
      ? rule.baseFee
      : rule.flatFee > 0
        ? rule.flatFee
        : 0
    : defaults.baseFee;

  const perUnitFee = rule
    ? rule.perUnitFee > 0
      ? rule.perUnitFee
      : rule.perKgRate > 0
        ? rule.perKgRate * unitWeight
        : 0
    : defaults.perUnitFee > 0
      ? defaults.perUnitFee
      : defaults.perKgRate * unitWeight;

  return { baseFee: round(baseFee), perUnitFee: round(perUnitFee) };
}

/**
 * The goods classes a category falls into for one forwarder.
 *
 * More than one, because one item is often more than one thing to a forwarder:
 * a fridge is a normal good *and* an appliance, and they charge for both. Their
 * explicit mapping first; a category they never placed falls to the class they
 * marked as the default, then to their first class. Empty when they have set no
 * classes up.
 */
export function resolveGoodsClasses(
  forwarder: Pick<Forwarder, "goodsClasses" | "categoryMap"> | null,
  categoryId: string,
): GoodsClass[] {
  if (!forwarder || forwarder.goodsClasses.length === 0) return [];
  const mapped = forwarder.categoryMap[categoryId] ?? [];
  const chosen = forwarder.goodsClasses.filter((g) => mapped.includes(g.id));
  if (chosen.length > 0) return chosen;
  const fallback =
    forwarder.goodsClasses.find((g) => g.isDefault) ?? forwarder.goodsClasses[0] ?? null;
  return fallback ? [fallback] : [];
}

/**
 * What one lane charges per cubic metre for a line, across every class it is in.
 *
 * The rates add up. A forwarder who prices normal goods at $285 and appliances
 * at $10 is quoting $295 for a fridge, which is what they would write on an
 * invoice — the levy row is a surcharge, not an alternative.
 *
 * One N/A cell settles it: a lane that refuses appliances refuses this fridge,
 * whatever the other rows say. A class with no cell at all on the lane simply
 * adds nothing; only when *none* of the classes has a cell does the lane's
 * catch-all row apply, so a catch-all can never be added on top of a real rate.
 */
export function resolveLaneRate(
  route: ForwarderRoute | null,
  classes: GoodsClass[],
): { ratePerCbm: number; isAvailable: boolean; cells: RouteRate[] } {
  if (!route) return { ratePerCbm: 0, isAvailable: false, cells: [] };

  const cells = classes
    .map((c) => route.rates.find((r) => r.goodsClassId === c.id))
    .filter((r): r is RouteRate => Boolean(r));

  if (cells.length === 0) {
    const catchAll = route.rates.find((r) => !r.goodsClassId) ?? null;
    return catchAll
      ? {
          ratePerCbm: Math.max(0, catchAll.ratePerCbm),
          isAvailable: catchAll.isAvailable && catchAll.ratePerCbm > 0,
          cells: [catchAll],
        }
      : { ratePerCbm: 0, isAvailable: false, cells: [] };
  }

  const ratePerCbm = round(cells.reduce((sum, c) => sum + Math.max(0, c.ratePerCbm), 0));
  const isAvailable = cells.every((c) => c.isAvailable) && ratePerCbm > 0;
  return { ratePerCbm, isAvailable, cells };
}

/** Every lane a seller could list on for this forwarder. */
export function activeRoutes(forwarder: Pick<Forwarder, "routes"> | null): ForwarderRoute[] {
  return (forwarder?.routes ?? []).filter((r) => r.isActive);
}

/** The lanes this forwarder runs into one of their Ghana points. */
export function routesToPoint(
  forwarder: Pick<Forwarder, "routes"> | null,
  pointId: string | null,
): ForwarderRoute[] {
  if (!pointId) return [];
  return activeRoutes(forwarder).filter((r) => r.destinationPointId === pointId);
}

/**
 * The lane a listing is quoted on.
 *
 * The chosen lane wins, provided it belongs to this forwarder and is live — a
 * route id from a browser is a claim. Then the one marked default, then the
 * first. Null when the forwarder sells no lanes, which the caller reports as an
 * unpriced route.
 */
export function resolveRoute(
  forwarder: Pick<Forwarder, "routes"> | null,
  chosenRouteId?: string | null,
): ForwarderRoute | null {
  const routes = activeRoutes(forwarder);
  if (routes.length === 0) return null;
  if (chosenRouteId) {
    const chosen = routes.find((r) => r.id === chosenRouteId);
    if (chosen) return chosen;
  }
  return routes.find((r) => r.isDefault) ?? routes[0];
}

/** A point's label for a picker: "Sunyani Depot — Sunyani". */
export function describePoint(point: Pick<ConsolidationPoint, "name" | "city">): string {
  return point.city ? `${point.name} — ${point.city}` : point.name;
}

/** A lane's label: its own name, else "Sea freight". */
export function describeRoute(
  route: Pick<ForwarderRoute, "name" | "mode">,
  destinationName = "",
): string {
  if (route.name.trim()) return route.name.trim();
  const mode = freightModeLabel(route.mode) || route.mode;
  return destinationName ? `${mode} → ${destinationName}` : mode;
}

/** "7–14 days", or "14 days" when the window has no spread. */
export function describeTransit(minDays: number, maxDays: number): string {
  const lo = Math.max(0, Math.round(minDays));
  const hi = Math.max(lo, Math.round(maxDays));
  if (hi === 0) return "";
  return lo === hi ? `${hi} days` : `${lo}–${hi} days`;
}

// ---------------------------------------------------------------------------
// Pricing one line
// ---------------------------------------------------------------------------

/** One cart line, with everything that decides what moving it costs. */
export interface ShipmentLine {
  /** Which seller this line belongs to. Consignments are grouped by it. */
  vendorId: string;
  quantity: number;
  /** The listed price of one unit. */
  unitPrice: number;
  size: ItemSize;
  categoryId: string;
  method: ShippingMethod;
  /** The hand-quoted fee per unit, when `method` is "manual". */
  manualFee: number;
  /** Origin country code. "GH" (or blank) is domestic. */
  originCountry: string;
  /** Where this line's goods gather in Ghana. */
  point: ConsolidationPoint | null;
  /** The forwarder carrying the international leg, when one does. */
  forwarder: Forwarder | null;
  /** The lane the listing was set up on, or the one the buyer chose. */
  routeId?: string | null;
  /** True when the supplier's price already reaches the Ghana point. */
  supplierDelivers: boolean;
  /** Leg 1, GH₵ per unit: supplier → the forwarder's warehouse abroad. */
  supplierFreight: number;
}

/**
 * What one line costs to ship, and what that figure is made of.
 *
 * `fee` is the only number a buyer ever sees. The rest exists so an admin can
 * answer "why is this GH₵240?", so a seller's estimate is honest, and so the
 * finance reports can tell one leg from another.
 */
export interface LineShipping {
  /** The one figure: everything below, added up. */
  fee: number;
  /** Leg 1: supplier → the forwarder's warehouse abroad. */
  supplierFreight: number;
  /** Leg 2: the forwarder's lane into their Ghana point. */
  internationalFreight: number;
  /** Leg 3: that point → the buyer's pickup station. */
  localFreight: number;
  /** The billable weight the line was measured at. */
  billableWeightKg: number;
  /** The cubic metres the international leg was priced on, levy included. */
  cbm: number;
  method: ShippingMethod;
  /** True when the goods already sit at the station the buyer chose. */
  collectedAtOrigin: boolean;
  /**
   * True when this line expects to be charged for freight into Ghana and
   * nothing prices it — no lane, or a lane that will not carry this class.
   * Checkout refuses the order rather than selling at a loss.
   */
  unpricedRoute: boolean;
  /** The lane this line was quoted on, when one carried it. */
  route: ForwarderRoute | null;
  /** The forwarder's own classes this line was priced as — every one of them. */
  goodsClasses: GoodsClass[];
  /** Their rates for those classes, added up. In the lane's currency. */
  ratePerCbm: number;
  /** The delivery estimate promised. Zero when it never leaves Ghana. */
  transitMinDays: number;
  transitMaxDays: number;
}

const ZERO_LINE: Omit<LineShipping, "method"> = {
  fee: 0,
  supplierFreight: 0,
  internationalFreight: 0,
  localFreight: 0,
  billableWeightKg: 0,
  cbm: 0,
  collectedAtOrigin: false,
  unpricedRoute: false,
  route: null,
  goodsClasses: [],
  ratePerCbm: 0,
  transitMinDays: 0,
  transitMaxDays: 0,
};

/** True for an origin outside Ghana. Blank counts as domestic. */
export function isImported(originCountry: string): boolean {
  const code = (originCountry || "GH").toUpperCase();
  return code !== "GH";
}

/** True when a line's goods already sit at the station the buyer picked. */
export function collectedAtOrigin(line: ShipmentLine, destPickupId: string): boolean {
  return Boolean(
    destPickupId && line.point?.pickupPointId && line.point.pickupPointId === destPickupId,
  );
}

/**
 * The cubic metres one consignment of this line is billed at.
 *
 * The goods' own volume, and nothing else. Every levy a forwarder charges is a
 * rate on the other side of the multiplication — see `resolveLaneRate` — so
 * nothing here may inflate the volume. A figure that quietly grew by ten cubic
 * metres is a figure nobody can check against a tape measure.
 */
export function billableCbm(size: ItemSize, quantity: number): number {
  const qty = Math.max(1, Math.round(quantity));
  return roundCbm(itemCbm(size) * qty);
}

/**
 * The international leg for one line, in GH₵, plus what it was priced on.
 *
 * The forwarder's grid and nothing else: their rate per cubic metre for this
 * class on this lane, applied to the billable volume and converted from their
 * currency at the end, in one place, so one exchange-rate correction moves
 * every figure that depends on it.
 */
export function internationalLegFee(
  line: ShipmentLine,
  config: ShippingConfig,
): {
  fee: number;
  cbm: number;
  ratePerCbm: number;
  route: ForwarderRoute | null;
  goodsClasses: GoodsClass[];
  unpriced: boolean;
} {
  const route = resolveRoute(line.forwarder, line.routeId);
  const goodsClasses = resolveGoodsClasses(line.forwarder, line.categoryId);
  const cbm = billableCbm(line.size, line.quantity);

  const lane = resolveLaneRate(route, goodsClasses);

  // No lane, no cell, an N/A cell, or a cell nobody put a number in. Saying so
  // lets checkout refuse the order; quoting zero would sell a sea container for
  // the price of the courier run at the other end.
  if (!route || !lane.isAvailable) {
    return { fee: 0, cbm, ratePerCbm: 0, route, goodsClasses, unpriced: true };
  }

  const currency = route.currency || line.forwarder?.currency || HOME_CURRENCY;
  return {
    fee: round(toGhs(lane.ratePerCbm * cbm, currency, config.currencies)),
    cbm,
    ratePerCbm: lane.ratePerCbm,
    route,
    goodsClasses,
    unpriced: false,
  };
}

/**
 * Price one line's *international* half.
 *
 * The domestic leg is deliberately absent: it belongs to the consignment, not
 * to the line, and is added by `quoteShipment` once per seller. Callers who
 * want a whole-line figure use that.
 */
export function priceLine(
  line: ShipmentLine,
  destPickupId: string,
  config: ShippingConfig,
): LineShipping {
  const qty = Math.max(1, Math.round(line.quantity));
  const weight = billableWeightKg(line.size, config.defaults.volumetricDivisor) * qty;
  const atOrigin = collectedAtOrigin(line, destPickupId);

  if (line.method === "free") {
    return { ...ZERO_LINE, method: "free", collectedAtOrigin: atOrigin };
  }

  // A special shipment was quoted by a person who looked at the actual thing.
  // Nothing is added to their figure: the point of quoting a car by hand is
  // that no table gets to have an opinion about it.
  if (line.method === "manual") {
    return {
      ...ZERO_LINE,
      method: "manual",
      fee: round(line.manualFee * qty),
      billableWeightKg: weight,
      collectedAtOrigin: atOrigin,
    };
  }

  if (!isImported(line.originCountry)) {
    return {
      ...ZERO_LINE,
      method: "auto",
      billableWeightKg: weight,
      collectedAtOrigin: atOrigin,
    };
  }

  // Arrangement 1: the supplier's price already reaches the Ghana point. There
  // is no leg to charge — the buyer paid for it inside the item price.
  if (line.supplierDelivers) {
    return {
      ...ZERO_LINE,
      method: "auto",
      billableWeightKg: weight,
      cbm: billableCbm(line.size, qty),
      collectedAtOrigin: atOrigin,
    };
  }

  // Arrangement 2: a forwarder carries it, and the buyer paid to reach them.
  const supplierFreight = round(line.supplierFreight * qty);
  const leg = internationalLegFee(line, config);

  return {
    ...ZERO_LINE,
    fee: round(supplierFreight + leg.fee),
    supplierFreight,
    internationalFreight: leg.fee,
    billableWeightKg: weight,
    cbm: leg.cbm,
    method: "auto",
    collectedAtOrigin: atOrigin,
    unpricedRoute: leg.unpriced,
    route: leg.route,
    goodsClasses: leg.goodsClasses,
    ratePerCbm: leg.ratePerCbm,
    transitMinDays: leg.route?.minDays ?? 0,
    transitMaxDays: leg.route?.maxDays ?? 0,
  };
}

// ---------------------------------------------------------------------------
// The domestic leg: one consignment per seller
// ---------------------------------------------------------------------------

/** What one seller's consignment costs to bring to the buyer's station. */
export interface ConsignmentQuote {
  vendorId: string;
  /** The consolidation point it leaves from. */
  pointId: string | null;
  /** Total units in the consignment. */
  units: number;
  /** Charged once. */
  baseFee: number;
  /** The increments for every unit after the first, added up. */
  incrementFee: number;
  /** baseFee + incrementFee, floored at the platform minimum. */
  fee: number;
  /** True when the goods already sit at the station the buyer chose. */
  collectedAtOrigin: boolean;
}

/** The key a consignment is grouped under. */
function consignmentKey(line: ShipmentLine): string {
  // Seller first, because that is what a consignment is. The point is part of
  // the key because a seller whose goods gather in two places is genuinely
  // handing over two loads, and one base fee for both would price a journey
  // nobody makes.
  return `${line.vendorId}::${line.point?.id ?? ""}`;
}

/**
 * Price every seller's consignment, and hand each line its share.
 *
 * The base fee is charged once per consignment, and it is the largest base any
 * line in it resolves to: a rule that says a fridge costs GH₵60 to move must
 * not be undercut by a phone case in the same box. Every unit after that first
 * one adds its own line's increment.
 */
export function quoteConsignments(
  lines: ShipmentLine[],
  destPickupId: string,
  config: ShippingConfig,
): { consignments: ConsignmentQuote[]; perLineLocal: number[] } {
  const perLineLocal = lines.map(() => 0);
  const consignments: ConsignmentQuote[] = [];

  // Only "auto" lines take part. A free listing is free and a hand-quoted one
  // already contains its whole journey.
  const groups = new Map<string, number[]>();
  lines.forEach((line, index) => {
    if (line.method !== "auto") return;
    const key = consignmentKey(line);
    const bucket = groups.get(key);
    if (bucket) bucket.push(index);
    else groups.set(key, [index]);
  });

  for (const indexes of groups.values()) {
    const first = lines[indexes[0]];
    const atOrigin = collectedAtOrigin(first, destPickupId);
    const units = indexes.reduce((s, i) => s + Math.max(1, Math.round(lines[i].quantity)), 0);

    // Nothing has to move: the goods are on the shelf the buyer is collecting
    // from. Also the no-destination case, which is checkout asking what a cart
    // costs before it knows where it is going.
    if (atOrigin || !destPickupId) {
      consignments.push({
        vendorId: first.vendorId,
        pointId: first.point?.id ?? null,
        units,
        baseFee: 0,
        incrementFee: 0,
        fee: 0,
        collectedAtOrigin: atOrigin,
      });
      continue;
    }

    const priced = indexes.map((i) => {
      const line = lines[i];
      const rule = resolveRule(config.rules, {
        originPointId: line.point?.id ?? null,
        destPickupId,
        categoryId: line.categoryId,
      });
      return {
        index: i,
        qty: Math.max(1, Math.round(line.quantity)),
        ...rulePricing(rule, line.size, config.defaults),
      };
    });

    // The base belongs to whichever line asks the most for it — and, where two
    // ask the same, to the one whose extra units are dearest.
    const lead = priced.reduce((best, p) =>
      p.baseFee > best.baseFee || (p.baseFee === best.baseFee && p.perUnitFee > best.perUnitFee)
        ? p
        : best,
    );

    let incrementFee = 0;
    for (const p of priced) {
      // The lead line's first unit is the one the base fee covers.
      const chargeableUnits = p === lead ? p.qty - 1 : p.qty;
      const share = round(p.perUnitFee * chargeableUnits);
      incrementFee = round(incrementFee + share);
      perLineLocal[p.index] = share;
    }

    const raw = round(lead.baseFee + incrementFee);
    const fee = round(Math.max(raw, config.defaults.minFee));
    // A minimum that bites is topped up on the line carrying the base, so the
    // parts still add to the total a buyer was shown.
    perLineLocal[lead.index] = round(perLineLocal[lead.index] + lead.baseFee + (fee - raw));

    consignments.push({
      vendorId: first.vendorId,
      pointId: first.point?.id ?? null,
      units,
      baseFee: lead.baseFee,
      incrementFee,
      fee,
      collectedAtOrigin: false,
    });
  }

  return { consignments, perLineLocal };
}

// ---------------------------------------------------------------------------
// Pricing a cart
// ---------------------------------------------------------------------------

export interface ShipmentQuote
  extends Omit<
    LineShipping,
    | "method"
    | "collectedAtOrigin"
    | "route"
    | "goodsClasses"
    | "ratePerCbm"
    | "transitMinDays"
    | "transitMaxDays"
  > {
  /** True when every line is already at the station the buyer chose. */
  allCollectedAtOrigin: boolean;
  /** True when any line is imported. */
  hasImported: boolean;
  /** One entry per seller consignment, for the breakdown. */
  consignments: ConsignmentQuote[];
}

const EMPTY_QUOTE: ShipmentQuote = {
  fee: 0,
  supplierFreight: 0,
  internationalFreight: 0,
  localFreight: 0,
  billableWeightKg: 0,
  cbm: 0,
  unpricedRoute: false,
  allCollectedAtOrigin: false,
  hasImported: false,
  consignments: [],
};

/** Add up priced lines into one shipment. */
export function sumShipping(
  lines: LineShipping[],
  imported: boolean[] = [],
  consignments: ConsignmentQuote[] = [],
): ShipmentQuote {
  if (lines.length === 0) return { ...EMPTY_QUOTE };
  const total = lines.reduce<ShipmentQuote>(
    (acc, l) => ({
      fee: round(acc.fee + l.fee),
      supplierFreight: round(acc.supplierFreight + l.supplierFreight),
      internationalFreight: round(acc.internationalFreight + l.internationalFreight),
      localFreight: round(acc.localFreight + l.localFreight),
      billableWeightKg: Math.round((acc.billableWeightKg + l.billableWeightKg) * 100) / 100,
      cbm: Math.round((acc.cbm + l.cbm) * 1000) / 1000,
      unpricedRoute: acc.unpricedRoute || l.unpricedRoute,
      allCollectedAtOrigin: acc.allCollectedAtOrigin && l.collectedAtOrigin,
      hasImported: acc.hasImported,
      consignments: acc.consignments,
    }),
    { ...EMPTY_QUOTE, allCollectedAtOrigin: true, consignments },
  );
  return { ...total, hasImported: imported.some(Boolean) };
}

/**
 * Price a whole cart to one destination.
 *
 * The international half is priced per line, because a lane belongs to the
 * goods. The domestic half is priced per seller, because a courier run belongs
 * to the consignment. Each line is then handed its share of its consignment so
 * the parts still add up to the number on the screen.
 */
export function quoteShipment(
  lines: ShipmentLine[],
  destPickupId: string,
  config: ShippingConfig,
): { quote: ShipmentQuote; perLine: LineShipping[] } {
  const international = lines.map((l) => priceLine(l, destPickupId, config));
  const { consignments, perLineLocal } = quoteConsignments(lines, destPickupId, config);

  const perLine = international.map((l, i) => {
    const localFreight = perLineLocal[i] ?? 0;
    return { ...l, localFreight, fee: round(l.fee + localFreight) };
  });

  return {
    quote: sumShipping(
      perLine,
      lines.map((l) => isImported(l.originCountry)),
      consignments,
    ),
    perLine,
  };
}

// ---------------------------------------------------------------------------
// Minimum order quantity
// ---------------------------------------------------------------------------

/** A listing's minimum order quantity, sanitised. Anything under one is one. */
export function normaliseMoq(value: number | null | undefined): number {
  const n = Math.round(Number(value ?? 1));
  return Number.isFinite(n) && n > 1 ? Math.min(n, 100_000) : 1;
}

/**
 * The quantity a buyer may actually order: never under the minimum, and always
 * a whole number. Used on the product page, in the cart and at checkout, so the
 * three cannot disagree about what "at least 12" means.
 */
export function clampToMoq(quantity: number, moq: number | null | undefined): number {
  const min = normaliseMoq(moq);
  const q = Math.round(Number(quantity) || 0);
  return q < min ? min : q;
}
