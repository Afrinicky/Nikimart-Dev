/**
 * The Nickimart shipping engine.
 *
 * One module answers one question: what does it cost to put this cart in this
 * buyer's hands at the station they picked?
 *
 * ## Inside Ghana: one consignment per seller
 *
 * Goods are gathered at a **consolidation point** — a seller's Kumasi store, a
 * supplier's Accra depot, Tema Port — checked there, and couriered to the
 * **pickup point** the buyer chose.
 *
 * That run is priced the way a courier actually prices one: a **base fee** for
 * the consignment, plus a small **increment** for every unit after the first.
 * And it is charged **per seller**, because a consignment is exactly that —
 * what one shop hands over, moved together. One bottle of spray costs the base
 * fee; ten bottles cost the base fee plus nine increments, not ten base fees.
 * Two sellers in one cart are two consignments and two base fees, which is also
 * the truth: two vans, two pickups, two handovers.
 *
 * The old model multiplied a per-line fee by the quantity, so ten bottles of
 * GH₵35 spray attracted GH₵100 of shipping for one parcel. That is the bug this
 * shape exists to remove.
 *
 * ## From abroad: the forwarder's own quote sheet
 *
 * A forwarder does not have "a rate". They have a rate for *this lane* — China
 * to their Accra depot by sea — and within it a rate for *this class of goods*:
 * normal, special, heavy-duty. A fridge picks up an energy-commission levy per
 * cubic metre; a carton of wigs picks up an FDA one. Sea is 35–45 days, air is
 * 7–14, and the buyer chooses between them. All of it is quoted in dollars, and
 * when the cedi moves every one of those numbers moves with it.
 *
 * So the international leg is priced off a **route** (lane + mode + Ghana
 * destination + currency + transit window) and a **goods class** (the
 * forwarder's own, with our categories mapped onto it). Rates are held in the
 * currency they were quoted in and converted here, so correcting one exchange
 * rate re-prices everything that depends on it.
 *
 * Two arrangements still exist and the bill differs:
 *
 *   1. **The supplier delivers.** Their price already reaches a Ghana
 *      consolidation point. Nothing is charged for the international leg; the
 *      buyer pays the local run from there.
 *   2. **A forwarder carries it.** The supplier only reaches a forwarder in
 *      their own country (the buyer pays that hop), and the route's rate brings
 *      it the rest of the way — normally inclusive of port fees, duty and tax,
 *      which is why none of those is then charged again.
 *
 * And some things no table should price: a car, a generator, anything fragile
 * enough to need its own arrangement. Those are quoted by hand at listing time.
 *
 * ## Two rules that matter more than the arithmetic
 *
 * **Same point, no fee.** If the goods are already consolidated at the station
 * the buyer picked, there is no journey left to charge for.
 *
 * **The buyer sees one number.** Duty, VAT, clearing, port fees and every
 * freight leg are computed here and kept here. What reaches the checkout is the
 * item price and one shipping figure. The components survive in the breakdown
 * for the admin console, the seller estimate, payouts and the finance reports —
 * they are just never a row on a buyer's bill.
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

/** How a listing's shipping is priced. */
export type ShippingMethod = "auto" | "free" | "manual";

export const SHIPPING_METHODS: ShippingMethod[] = ["auto", "free", "manual"];

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  auto: "Standard — priced automatically",
  free: "Free shipping",
  manual: "Special shipment — I set the fee",
};

export const SHIPPING_METHOD_HINTS: Record<ShippingMethod, string> = {
  auto: "Base fee for the first item, a small increment for each extra one. Freight from abroad is priced by the forwarder's route.",
  free: "No shipping is charged to any pickup point. You absorb the cost.",
  manual: "For cars, generators, fragile or oversized goods — anything a rate table would price wrongly.",
};

export function isShippingMethod(value: string | null | undefined): value is ShippingMethod {
  return value === "auto" || value === "free" || value === "manual";
}

/** Whether a consolidation point gathers local goods or imported ones. */
export type PointKind = "local" | "international";

export const POINT_KINDS: PointKind[] = ["local", "international"];

export const POINT_KIND_LABELS: Record<PointKind, string> = {
  local: "Local — goods from inside Ghana gather here",
  international: "International — imported consignments land and clear here",
};

export function isPointKind(value: string | null | undefined): value is PointKind {
  return value === "local" || value === "international";
}

/**
 * A consolidation point: where a load is brought together and checked.
 *
 * `pickupPointId` is the join that makes the whole system click. When a
 * consolidation point sits at a pickup station, a buyer who collects there has
 * nothing to pay — the goods are already in the room — and the shipping fee is
 * zero without anybody configuring a zero.
 */
export interface ConsolidationPoint {
  id: string;
  name: string;
  code: string;
  city: string;
  kind: PointKind;
  /** The pickup station this point sits at, when it is one. */
  pickupPointId: string | null;
  /** Ghana import duty here, percent of the landed value. International only. */
  dutyPercent: number;
  /** Flat clearing / handling (GH₵) per imported line landing here. */
  clearingFee: number;
  note: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/** The platform's own currency. Rates typed in it are never converted. */
export const HOME_CURRENCY = "GHS";

/** An exchange rate: what one unit of `code` is worth in GH₵. */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  rateToGhs: number;
  isActive: boolean;
}

/** The currencies a fresh install starts with. Rates are indicative, not live. */
export const DEFAULT_CURRENCIES: Currency[] = [
  { code: "GHS", name: "Ghana Cedi", symbol: "GH₵", rateToGhs: 1, isActive: true },
  { code: "USD", name: "US Dollar", symbol: "$", rateToGhs: 12, isActive: true },
  { code: "EUR", name: "Euro", symbol: "€", rateToGhs: 13, isActive: true },
  { code: "GBP", name: "British Pound", symbol: "£", rateToGhs: 15, isActive: true },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", rateToGhs: 1.7, isActive: true },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", rateToGhs: 3.3, isActive: true },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", rateToGhs: 0.35, isActive: true },
  { code: "ZAR", name: "South African Rand", symbol: "R", rateToGhs: 0.65, isActive: true },
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
// Forwarders, their goods classes and their routes
// ---------------------------------------------------------------------------

/**
 * One of the forwarder's own classes of goods.
 *
 * Never one of our categories: ours are what a shopper browses, theirs are what
 * a container is priced by. `surchargePerCbm` is the levy that rides on the
 * class whatever the route — the energy commission on appliances, the FDA
 * charge on diapers and wigs — quoted, like everything else, in the forwarder's
 * currency.
 */
export interface GoodsClass {
  id: string;
  name: string;
  note: string;
  surchargePerCbm: number;
  surchargeLabel: string;
  sortOrder: number;
  /** The class a category with no mapping of its own falls into. */
  isDefault: boolean;
}

/** One price on one route, for one goods class. `goodsClassId` null = catch-all. */
export interface RouteRate {
  id: string;
  goodsClassId: string | null;
  ratePerCbm: number;
  ratePerKg: number;
  minCharge: number;
  /** "Normal goods under 1 CBM — $260": anything smaller still bills as this. */
  minCbm: number;
  note: string;
}

/** One lane a forwarder sells, and what it costs on it. */
export interface ForwarderRoute {
  id: string;
  forwarderId: string;
  name: string;
  originCountry: string;
  originCity: string;
  /** air | sea | road | express. */
  mode: string;
  /** The Ghana consolidation point this lane lands at. */
  destinationPointId: string | null;
  /** The currency every rate on this route is quoted in. */
  currency: string;
  minDays: number;
  maxDays: number;
  note: string;
  isActive: boolean;
  isDefault: boolean;
  rates: RouteRate[];
}

/** One price on a forwarder's legacy list. `categoryId` null is their catch-all. */
export interface ForwarderRate {
  id: string;
  categoryId: string | null;
  label: string;
  ratePerCbm: number;
  ratePerKg: number;
  minCharge: number;
  transitDays: number;
}

/** A forwarder abroad, and what they charge to bring a load to Ghana. */
export interface Forwarder {
  id: string;
  name: string;
  code: string;
  /** The country they collect in: CN, AE, US, EU… */
  originCountry: string;
  /** air | sea | road | express — their headline mode. Routes may differ. */
  mode: string;
  /** The Ghana consolidation point they deliver into by default. */
  consolidationPointId: string | null;
  /** The currency they quote in, unless a route says otherwise. */
  currency: string;
  /**
   * True when the rate already covers port fees, duty and taxes to that point.
   * This is how Ghana-bound consolidators actually quote, so it is the default;
   * charging duty on top of such a rate bills the buyer twice for one thing.
   */
  allInclusive: boolean;
  note: string;
  /** Their standing notes: levies and quirks. Shown to people, never priced. */
  terms: string;
  isActive: boolean;
  goodsClasses: GoodsClass[];
  /** Our category id → their goods class id. */
  categoryMap: Record<string, string>;
  routes: ForwarderRoute[];
  /** The legacy flat price list, read only when there are no routes. */
  rates: ForwarderRate[];
}

/**
 * One domestic price, and the scope it applies to.
 *
 * Every part of the scope is optional. A rule with nothing set prices whatever
 * no sharper rule claims; one with a category and a route is the "all blenders,
 * Kumasi to Accra" case.
 *
 * `baseFee` is what one consignment costs and `perUnitFee` is what each unit
 * after the first adds. The two legacy columns are read as fallbacks and never
 * written: `flatFee` stands in for a missing base, and `perKgRate` derives an
 * increment from a single unit's billable weight. Neither is multiplied by the
 * quantity any more — that multiplication is the thing this model removes.
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
  /** Ghana VAT + levies (percent) on an imported line's landed value. */
  importTaxRate: number;
  /** Fallback import duty (percent) when a point sets none. */
  importDutyPercent: number;
  /** Fallback ₵/CBM from abroad when no route rate matches. */
  fallbackRatePerCbm: number;
}

export const SHIPPING_DEFAULTS: ShippingDefaults = {
  baseFee: 10,
  perUnitFee: 1.5,
  perKgRate: 0,
  volumetricDivisor: DEFAULT_VOLUMETRIC_DIVISOR,
  minFee: 0,
  importTaxRate: 21.9,
  importDutyPercent: 20,
  fallbackRatePerCbm: 0,
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

/**
 * The rule that governs one line's domestic leg, most specific first.
 *
 * A rule scores a point for each part of its scope that names something rather
 * than standing for "any", and the highest score wins. Ties go to the rule that
 * named the category, then the one that named the origin: given "anything from
 * Kumasi" and "blenders anywhere", a blender leaving Kumasi is more usefully a
 * blender — that is the rule somebody wrote on purpose about this kind of
 * goods, where the route rule is a default they set once and forgot.
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
 * directly: a rule written as "GH₵15 + GH₵4/kg" under the old system becomes
 * "GH₵15 for the first, GH₵4 × the unit's billable weight for each extra",
 * which is the same intent expressed in the shape that no longer multiplies.
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
 * The goods class a category falls into for one forwarder.
 *
 * Their explicit mapping first, then whichever class they marked as the
 * default, then their first class. Null when they have not set any classes up —
 * which the route rates handle as "use the catch-all price".
 */
export function resolveGoodsClass(
  forwarder: Pick<Forwarder, "goodsClasses" | "categoryMap"> | null,
  categoryId: string,
): GoodsClass | null {
  if (!forwarder || forwarder.goodsClasses.length === 0) return null;
  const mapped = forwarder.categoryMap[categoryId];
  return (
    forwarder.goodsClasses.find((g) => g.id === mapped) ??
    forwarder.goodsClasses.find((g) => g.isDefault) ??
    forwarder.goodsClasses[0] ??
    null
  );
}

/** The route rate for a goods class: its own row, else the route's catch-all. */
export function resolveRouteRate(
  route: ForwarderRoute | null,
  goodsClassId: string | null,
): RouteRate | null {
  if (!route) return null;
  return (
    (goodsClassId ? route.rates.find((r) => r.goodsClassId === goodsClassId) : undefined) ??
    route.rates.find((r) => !r.goodsClassId) ??
    null
  );
}

/**
 * The forwarder's price for a category on their legacy list: their row for it,
 * else their catch-all. Only consulted for a forwarder with no routes.
 */
export function resolveForwarderRate(
  forwarder: Pick<Forwarder, "rates"> | null,
  categoryId: string,
): ForwarderRate | null {
  if (!forwarder) return null;
  return (
    forwarder.rates.find((r) => r.categoryId && r.categoryId === categoryId) ??
    forwarder.rates.find((r) => !r.categoryId) ??
    null
  );
}

/** Every route a buyer could be offered for this forwarder. */
export function activeRoutes(forwarder: Pick<Forwarder, "routes"> | null): ForwarderRoute[] {
  return (forwarder?.routes ?? []).filter((r) => r.isActive);
}

/**
 * The route a listing is quoted on when the buyer has not chosen one.
 *
 * A chosen route wins, provided it belongs to this forwarder and is live — the
 * choice arrives from a browser and a route id from a browser is a claim. Then
 * the one the admin marked default, then the first. Null when the forwarder
 * sells no lanes yet, which the caller reports as an unpriced route.
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

/** A point's label for a picker: "Tema Port — Tema". */
export function describePoint(point: Pick<ConsolidationPoint, "name" | "city">): string {
  return point.city ? `${point.name} — ${point.city}` : point.name;
}

/** A route's label for a picker: "China → Accra · Sea freight · 35–45 days". */
export function describeRoute(
  route: Pick<ForwarderRoute, "name" | "originCity" | "originCountry" | "mode" | "minDays" | "maxDays">,
  destinationName = "",
): string {
  if (route.name.trim()) return route.name.trim();
  const from = route.originCity || route.originCountry || "Abroad";
  const to = destinationName || "Ghana";
  return `${from} → ${to}`;
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
  /** The listed price of one unit — the base for duty and origin tax. */
  unitPrice: number;
  size: ItemSize;
  categoryId: string;
  method: ShippingMethod;
  /** The hand-quoted fee per unit, when `method` is "manual". */
  manualFee: number;
  /** Origin country code. "GH" (or blank) is domestic. */
  originCountry: string;
  /** Where this line's goods gather. Null falls back to the platform default. */
  point: ConsolidationPoint | null;
  /** The forwarder carrying the international leg, when one does. */
  forwarder: Forwarder | null;
  /** The route the buyer chose. Blank takes the forwarder's default route. */
  routeId?: string | null;
  /** True when the supplier's price already reaches the Ghana point. */
  supplierDelivers: boolean;
  /** Leg 1, GH₵ per unit: supplier → the forwarder abroad. The buyer pays it. */
  supplierFreight: number;
  /** Sales tax in the country of purchase, percent of the goods. */
  originTaxRate: number;
  /** Ghana VAT + levies, percent. Negative means "use the platform rate". */
  taxRate: number;
  /** True when duty and clearing are already covered by the price. */
  dutyIncluded: boolean;
}

/**
 * What one line costs to ship, and what that figure is made of.
 *
 * `fee` is the only number a buyer ever sees. The rest exists so an admin can
 * answer "why is this GH₵240?", so a seller's estimate is honest about what
 * they are asking somebody to pay, and so the finance reports can tell a
 * courier run from a customs bill.
 */
export interface LineShipping {
  /** The one figure: everything below, added up. */
  fee: number;
  /** Leg 1: supplier → forwarder abroad. */
  supplierFreight: number;
  /** Leg 2: forwarder → the Ghana consolidation point. */
  internationalFreight: number;
  /** Leg 3: the consolidation point → the buyer's pickup station. */
  localFreight: number;
  /** Ghana import duty on the landed value. */
  importDuty: number;
  /** Clearing and handling at the point. */
  clearingFee: number;
  /** Ghana VAT and levies. */
  tax: number;
  /** Sales tax in the country of purchase. */
  originTax: number;
  /** The billable weight the line was measured at. */
  billableWeightKg: number;
  /** The cubic metres the international leg was priced on. */
  cbm: number;
  method: ShippingMethod;
  /** True when the goods already sit at the station the buyer chose. */
  collectedAtOrigin: boolean;
  /**
   * True when this line expects to be charged for freight into Ghana and
   * nothing prices it. Checkout refuses the order rather than selling at a loss.
   */
  unpricedRoute: boolean;
  /** The route this line was quoted on, when one carried it. */
  route: ForwarderRoute | null;
  /** The forwarder's own class this line was priced as. */
  goodsClass: GoodsClass | null;
  /** The transit window promised for this line. Zero when it never leaves Ghana. */
  transitMinDays: number;
  transitMaxDays: number;
}

const ZERO_LINE: Omit<LineShipping, "method"> = {
  fee: 0,
  supplierFreight: 0,
  internationalFreight: 0,
  localFreight: 0,
  importDuty: 0,
  clearingFee: 0,
  tax: 0,
  originTax: 0,
  billableWeightKg: 0,
  cbm: 0,
  collectedAtOrigin: false,
  unpricedRoute: false,
  route: null,
  goodsClass: null,
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
 * The international leg for one line, in GH₵, plus what it was priced on.
 *
 * Volume first, because that is how a forwarder invoices, floored at the rate's
 * minimum cubic metres — the "under 1 CBM still bills as one" line every quote
 * sheet has. The class surcharge (energy commission, FDA) rides on the same
 * volume. Everything is converted from the route's currency at the end, in one
 * place, so an exchange-rate correction moves the whole figure at once.
 */
export function internationalLegFee(
  line: ShipmentLine,
  config: ShippingConfig,
): {
  fee: number;
  cbm: number;
  route: ForwarderRoute | null;
  goodsClass: GoodsClass | null;
  unpriced: boolean;
} {
  const qty = Math.max(1, Math.round(line.quantity));
  const cbm = Math.round(itemCbm(line.size) * qty * 1_000_000) / 1_000_000;
  const weight = billableWeightKg(line.size, config.defaults.volumetricDivisor) * qty;

  const route = resolveRoute(line.forwarder, line.routeId);
  const goodsClass = resolveGoodsClass(line.forwarder, line.categoryId);

  if (route) {
    const rate = resolveRouteRate(route, goodsClass?.id ?? null);
    if (rate) {
      const billedCbm = Math.max(cbm, rate.minCbm > 0 ? rate.minCbm : 0);
      const carriage = Math.max(
        rate.ratePerCbm * billedCbm + rate.ratePerKg * weight,
        rate.minCharge,
      );
      const surcharge = (goodsClass?.surchargePerCbm ?? 0) * billedCbm;
      const currency = route.currency || line.forwarder?.currency || HOME_CURRENCY;
      return {
        fee: round(toGhs(carriage + surcharge, currency, config.currencies)),
        cbm,
        route,
        goodsClass,
        unpriced: false,
      };
    }
  }

  // No routes yet: fall back to the forwarder's legacy flat list, so a
  // forwarder configured under the previous system keeps quoting until
  // somebody moves them onto routes. Nothing writes that list any more.
  const legacy = resolveForwarderRate(line.forwarder, line.categoryId);
  if (legacy) {
    const carriage = Math.max(
      legacy.ratePerCbm * cbm + legacy.ratePerKg * weight,
      legacy.minCharge,
    );
    const currency = line.forwarder?.currency || HOME_CURRENCY;
    return {
      fee: round(toGhs(carriage, currency, config.currencies)),
      cbm,
      route: null,
      goodsClass,
      unpriced: false,
    };
  }

  if (config.defaults.fallbackRatePerCbm > 0) {
    return {
      fee: round(config.defaults.fallbackRatePerCbm * cbm),
      cbm,
      route,
      goodsClass,
      unpriced: false,
    };
  }

  // Nobody has priced this route. Saying so lets checkout refuse the order;
  // quoting zero would sell a sea container for the price of the courier run
  // at the other end.
  return { fee: 0, cbm, route, goodsClass, unpriced: true };
}

/**
 * Price one line's *international* half, plus everything the state takes.
 *
 * The domestic leg is deliberately absent: it belongs to the consignment, not
 * to the line, and is added by `quoteShipment` once per seller. Callers who
 * want a whole-line figure use that.
 *
 * Duty and VAT follow customs practice rather than intuition: duty is assessed
 * on the landed value — the goods plus the freight that brought them here — and
 * VAT on that value plus the duty. Charging either on the goods alone
 * under-quotes, and a shortfall discovered at a customs desk with the item
 * already in the country is much worse than an over-quote.
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

  // --- The international leg ------------------------------------------------
  const goods = line.unitPrice * qty;
  const originTax = round((goods * Math.max(0, line.originTaxRate)) / 100);

  // Arrangement 1: the supplier's price already reaches the Ghana point. There
  // is no leg to charge and no border left to clear — the buyer paid for both
  // inside the price, and billing either again would be a second charge for one
  // journey.
  if (line.supplierDelivers) {
    return {
      ...ZERO_LINE,
      method: "auto",
      fee: originTax,
      originTax,
      billableWeightKg: weight,
      cbm: Math.round(itemCbm(line.size) * qty * 1_000_000) / 1_000_000,
      collectedAtOrigin: atOrigin,
    };
  }

  // Arrangement 2: a forwarder carries it, and the buyer paid to reach them.
  const supplierFreight = round(line.supplierFreight * qty);
  const leg = internationalLegFee(line, config);

  // An all-inclusive forwarder rate already contains the port fees, the duty
  // and the taxes to their Ghana point. Assessing them again on top of it is
  // the single easiest way this engine could overcharge somebody.
  const allInclusive = line.forwarder?.allInclusive ?? false;
  const settledAtBorder = allInclusive || line.dutyIncluded;

  const landedValue = goods + supplierFreight + leg.fee;
  const dutyPercent = line.point?.dutyPercent || config.defaults.importDutyPercent;
  const importDuty = settledAtBorder ? 0 : round((landedValue * Math.max(0, dutyPercent)) / 100);
  const clearingFee = settledAtBorder ? 0 : round(line.point?.clearingFee ?? 0);
  const taxRate = line.taxRate >= 0 ? line.taxRate : Math.max(0, config.defaults.importTaxRate);
  const tax = settledAtBorder ? 0 : round(((landedValue + importDuty) * taxRate) / 100);

  const fee = round(supplierFreight + leg.fee + importDuty + clearingFee + tax + originTax);

  return {
    fee,
    supplierFreight,
    internationalFreight: leg.fee,
    localFreight: 0,
    importDuty,
    clearingFee,
    tax,
    originTax,
    billableWeightKg: weight,
    cbm: leg.cbm,
    method: "auto",
    collectedAtOrigin: atOrigin,
    unpricedRoute: leg.unpriced,
    route: leg.route,
    goodsClass: leg.goodsClass,
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
  // the key because a seller who gathers some goods in Kumasi and some in Accra
  // is genuinely handing over two loads from two places, and charging one base
  // fee for both would price a journey that nobody makes.
  return `${line.vendorId}::${line.point?.id ?? ""}`;
}

/**
 * Price every seller's consignment, and hand each line its share.
 *
 * The base fee is charged once per consignment, and it is the largest base any
 * line in it resolves to: a rule that says a fridge costs GH₵60 to move must
 * not be undercut by a phone case in the same box. Every unit after that first
 * one adds its own line's increment — so the fridge's ninth unit costs what a
 * fridge costs and the phone case's does not.
 *
 * Lines are handed back their share so an order line, a payout and a finance
 * report can each be honest about which seller's freight was whose: the lead
 * line carries the base, every line carries its own increments.
 */
export function quoteConsignments(
  lines: ShipmentLine[],
  destPickupId: string,
  config: ShippingConfig,
): { consignments: ConsignmentQuote[]; perLineLocal: number[] } {
  const perLineLocal = lines.map(() => 0);
  const consignments: ConsignmentQuote[] = [];

  // Only "auto" lines take part. A free listing is free and a hand-quoted one
  // already contains its whole journey; folding either into a shared base fee
  // would charge for a run somebody already decided the price of.
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
      return { index: i, qty: Math.max(1, Math.round(line.quantity)), ...rulePricing(rule, line.size, config.defaults) };
    });

    // The base belongs to whichever line asks the most for it — and, where two
    // ask the same, to the one whose extra units are dearest, so the unit that
    // rides free on the base is the expensive one rather than the cheap one.
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
    "method" | "collectedAtOrigin" | "route" | "goodsClass" | "transitMinDays" | "transitMaxDays"
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
  importDuty: 0,
  clearingFee: 0,
  tax: 0,
  originTax: 0,
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
      importDuty: round(acc.importDuty + l.importDuty),
      clearingFee: round(acc.clearingFee + l.clearingFee),
      tax: round(acc.tax + l.tax),
      originTax: round(acc.originTax + l.originTax),
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
 * The international half is priced per line, because a route and a customs
 * regime belong to the goods. The domestic half is priced per seller, because a
 * courier run belongs to the consignment. Each line is then handed its share of
 * its consignment so the parts still add up to the number on the screen.
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
