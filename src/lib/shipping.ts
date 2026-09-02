/**
 * The Nickimart shipping engine.
 *
 * One module answers one question: what does it cost to put this cart in this
 * buyer's hands at the station they picked? Everything the old system spread
 * across a CBM matrix, an arrival-point rate table and half of Settings now
 * lands here, in the shape the business actually works in.
 *
 * ## The journey
 *
 * Every order is collected. Goods are gathered at a **consolidation point** —
 * a seller's Kumasi store, a supplier's Accra depot, Tema Port — checked there,
 * and then couriered to the **pickup point** the buyer chose. That is one leg,
 * and it is priced the way a Ghanaian courier prices one: on billable weight,
 * the greater of what a parcel weighs and what its size says it weighs. Cubic
 * metres are how sea freight is sold and not how a van crossing Ghana is; a
 * seller listing a blender should not have to compute m³ to four decimals.
 *
 * When the goods come from abroad there is a leg in front of that one, and CBM
 * is exactly right for it, because that is how the forwarder invoices. Two
 * arrangements exist and the bill differs:
 *
 *   1. **The supplier delivers.** Their price already covers everything to a
 *      Ghana consolidation point. Nothing is charged for the international leg
 *      at all; the buyer pays the local run from that point onwards.
 *   2. **A forwarder carries it.** The supplier only reaches a forwarder in
 *      their own country (the buyer pays that hop), and the forwarder's rate
 *      per cubic metre brings it the rest of the way. That rate normally
 *      contains the carriage, the port fees, the duty and the taxes up to their
 *      Ghana point — so when it does, none of those is charged again.
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
  auto: "Uses the shipping rules: weight and route inside Ghana, the forwarder's rate from abroad.",
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

/** One price on a forwarder's list. `categoryId` null is their catch-all. */
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
  /** air | sea | road | express. */
  mode: string;
  /** The Ghana consolidation point they deliver into. */
  consolidationPointId: string | null;
  /**
   * True when the rate already covers port fees, duty and taxes to that point.
   * This is how Ghana-bound consolidators actually quote, so it is the default;
   * charging duty on top of such a rate bills the buyer twice for one thing.
   */
  allInclusive: boolean;
  note: string;
  isActive: boolean;
  rates: ForwarderRate[];
}

/**
 * One domestic price, and the scope it applies to.
 *
 * Every part of the scope is optional. A rule with nothing set prices whatever
 * no sharper rule claims; one with a category and a route is the "all blenders,
 * Kumasi to Accra, GH₵50" case. `flatFee` above zero wins over the weight
 * component — a flat price is a decision, not a starting point.
 */
export interface ShippingRule {
  id: string;
  originPointId: string | null;
  destPickupId: string | null;
  categoryId: string | null;
  flatFee: number;
  baseFee: number;
  perKgRate: number;
  note: string;
  isActive: boolean;
}

/** The platform-wide numbers behind every rule. */
export interface ShippingDefaults {
  /** Charged per consignment before the weight component. */
  baseFee: number;
  /** GH₵ per billable kilogram. */
  perKgRate: number;
  /** cm³ per volumetric kilogram. */
  volumetricDivisor: number;
  /** No domestic leg is billed under this, once it is billed at all. */
  minFee: number;
  /** Ghana VAT + levies (percent) on an imported line's landed value. */
  importTaxRate: number;
  /** Fallback import duty (percent) when a point sets none. */
  importDutyPercent: number;
  /** Fallback ₵/CBM from abroad when no forwarder rate matches. */
  fallbackRatePerCbm: number;
}

export const SHIPPING_DEFAULTS: ShippingDefaults = {
  baseFee: 15,
  perKgRate: 4,
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
 * The forwarder's price for a category: their row for it, else their catch-all.
 *
 * Null when the forwarder has no price list at all, which the caller reports as
 * an unpriced route rather than quoting the carriage at nothing.
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

/** A point's label for a picker: "Tema Port — Tema". */
export function describePoint(point: Pick<ConsolidationPoint, "name" | "city">): string {
  return point.city ? `${point.name} — ${point.city}` : point.name;
}

// ---------------------------------------------------------------------------
// Pricing one line
// ---------------------------------------------------------------------------

/** One cart line, with everything that decides what moving it costs. */
export interface ShipmentLine {
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
  /** The billable weight the local leg was priced on. */
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
};

/** True for an origin outside Ghana. Blank counts as domestic. */
export function isImported(originCountry: string): boolean {
  const code = (originCountry || "GH").toUpperCase();
  return code !== "GH";
}

/**
 * The domestic leg for one line: the consolidation point → the pickup station.
 *
 * Zero when they are the same place. Otherwise the governing rule decides: a
 * flat fee if it names one, else base + per-kg on the billable weight, else the
 * platform defaults. The minimum applies only to a leg that is actually being
 * charged — flooring a free collection at GH₵5 would undo the point of it.
 */
export function localLegFee(
  line: ShipmentLine,
  destPickupId: string,
  config: ShippingConfig,
): { fee: number; weightKg: number; collectedAtOrigin: boolean } {
  const qty = Math.max(1, Math.round(line.quantity));
  const weightKg = billableWeightKg(line.size, config.defaults.volumetricDivisor) * qty;

  if (line.point && line.point.pickupPointId && line.point.pickupPointId === destPickupId) {
    return { fee: 0, weightKg, collectedAtOrigin: true };
  }

  const rule = resolveRule(config.rules, {
    originPointId: line.point?.id ?? null,
    destPickupId,
    categoryId: line.categoryId,
  });

  if (rule && rule.flatFee > 0) {
    return { fee: round(rule.flatFee * qty), weightKg, collectedAtOrigin: false };
  }

  const baseFee = rule ? rule.baseFee : config.defaults.baseFee;
  const perKgRate = rule ? rule.perKgRate : config.defaults.perKgRate;
  const raw = baseFee + perKgRate * weightKg;
  return { fee: round(Math.max(raw, config.defaults.minFee)), weightKg, collectedAtOrigin: false };
}

/**
 * Price one line, whole.
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

  if (line.method === "free") {
    return { ...ZERO_LINE, method: "free" };
  }

  // A special shipment was quoted by a person who looked at the actual thing.
  // Nothing is added to their figure: the point of quoting a car by hand is
  // that no table gets to have an opinion about it.
  if (line.method === "manual") {
    return { ...ZERO_LINE, method: "manual", fee: round(line.manualFee * qty) };
  }

  const local = destPickupId
    ? localLegFee(line, destPickupId, config)
    : { fee: 0, weightKg: 0, collectedAtOrigin: false };

  if (!isImported(line.originCountry)) {
    return {
      ...ZERO_LINE,
      method: "auto",
      fee: local.fee,
      localFreight: local.fee,
      billableWeightKg: local.weightKg,
      collectedAtOrigin: local.collectedAtOrigin,
    };
  }

  // --- The international leg ------------------------------------------------
  const cbm = itemCbm(line.size) * qty;
  const weightForFreight = billableWeightKg(line.size, config.defaults.volumetricDivisor) * qty;
  const goods = line.unitPrice * qty;
  const originTax = round((goods * Math.max(0, line.originTaxRate)) / 100);

  // Arrangement 1: the supplier's price already reaches the Ghana point. There
  // is no leg to charge and no border left to clear — the buyer paid for both
  // inside the price, and billing either again would be a second charge for one
  // journey.
  if (line.supplierDelivers) {
    const fee = round(local.fee + originTax);
    return {
      ...ZERO_LINE,
      method: "auto",
      fee,
      localFreight: local.fee,
      originTax,
      billableWeightKg: local.weightKg,
      cbm,
      collectedAtOrigin: local.collectedAtOrigin,
    };
  }

  // Arrangement 2: a forwarder carries it, and the buyer paid to reach them.
  const supplierFreight = round(line.supplierFreight * qty);
  const rate = resolveForwarderRate(line.forwarder, line.categoryId);

  let internationalFreight = 0;
  let unpricedRoute = false;
  if (rate) {
    const byVolume = rate.ratePerCbm * cbm;
    const byWeight = rate.ratePerKg * weightForFreight;
    internationalFreight = round(Math.max(byVolume + byWeight, rate.minCharge));
  } else if (config.defaults.fallbackRatePerCbm > 0) {
    internationalFreight = round(config.defaults.fallbackRatePerCbm * cbm);
  } else {
    // Nobody has priced this route. Saying so lets checkout refuse the order;
    // quoting zero would sell a sea container for the price of the courier run
    // at the other end.
    unpricedRoute = true;
  }

  // An all-inclusive forwarder rate already contains the port fees, the duty
  // and the taxes to their Ghana point. Assessing them again on top of it is
  // the single easiest way this engine could overcharge somebody.
  const allInclusive = line.forwarder?.allInclusive ?? false;
  const settledAtBorder = allInclusive || line.dutyIncluded;

  const landedValue = goods + supplierFreight + internationalFreight;
  const dutyPercent = line.point?.dutyPercent || config.defaults.importDutyPercent;
  const importDuty = settledAtBorder ? 0 : round((landedValue * Math.max(0, dutyPercent)) / 100);
  const clearingFee = settledAtBorder ? 0 : round(line.point?.clearingFee ?? 0);
  const taxRate = line.taxRate >= 0 ? line.taxRate : Math.max(0, config.defaults.importTaxRate);
  const tax = settledAtBorder ? 0 : round(((landedValue + importDuty) * taxRate) / 100);

  const fee = round(
    supplierFreight + internationalFreight + importDuty + clearingFee + tax + originTax + local.fee,
  );

  return {
    fee,
    supplierFreight,
    internationalFreight,
    localFreight: local.fee,
    importDuty,
    clearingFee,
    tax,
    originTax,
    billableWeightKg: local.weightKg,
    cbm,
    method: "auto",
    collectedAtOrigin: local.collectedAtOrigin,
    unpricedRoute,
  };
}

// ---------------------------------------------------------------------------
// Pricing a cart
// ---------------------------------------------------------------------------

export interface ShipmentQuote extends Omit<LineShipping, "method" | "collectedAtOrigin"> {
  /** True when every line is already at the station the buyer chose. */
  allCollectedAtOrigin: boolean;
  /** True when any line is imported. */
  hasImported: boolean;
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
};

/** Add up priced lines into one shipment. */
export function sumShipping(lines: LineShipping[], imported: boolean[] = []): ShipmentQuote {
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
    }),
    { ...EMPTY_QUOTE, allCollectedAtOrigin: true },
  );
  return { ...total, hasImported: imported.some(Boolean) };
}

/** Price a whole cart to one destination. */
export function quoteShipment(
  lines: ShipmentLine[],
  destPickupId: string,
  config: ShippingConfig,
): { quote: ShipmentQuote; perLine: LineShipping[] } {
  const perLine = lines.map((l) => priceLine(l, destPickupId, config));
  return {
    quote: sumShipping(
      perLine,
      lines.map((l) => isImported(l.originCountry)),
    ),
    perLine,
  };
}
