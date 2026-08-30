// Nickimart shipping-fee engine — CBM (cubic-metre) based, pickup-only.
//
// Every order is collected at a Nickimart pickup point. A product ships from its
// origin hub (the pickup point where the seller's goods consolidate) to the
// buyer's chosen pickup point. The fee is the product's CBM × an admin-set
// ₵/CBM route rate. Goods shipped from abroad add an international leg
// (country → arrival hub) before the domestic leg (arrival hub → pickup point).
//
// This module is pure (no server-only imports) so the same maths runs on the
// client (live checkout estimate) and the server (authoritative re-price). The
// rate tables are loaded via getShippingRates() in settings and passed in.

/** Fallback per-unit CBM when a product has none recorded (~5 litres). */
export const DEFAULT_ITEM_CBM = 0.005;

/** CBM (cubic metres) from centimetre dimensions: L×W×H ÷ 1,000,000. */
export function cbmFromDimensions(lengthCm: number, widthCm: number, heightCm: number): number {
  const vol = (lengthCm || 0) * (widthCm || 0) * (heightCm || 0); // cm³
  return vol > 0 ? Math.round((vol / 1_000_000) * 1_000_000) / 1_000_000 : 0;
}

/** The billable per-unit CBM for a product: its stored CBM, else derived, else default. */
export function itemCbm(input: { cbm?: number; lengthCm?: number; widthCm?: number; heightCm?: number }): number {
  if (typeof input.cbm === "number" && input.cbm > 0) return input.cbm;
  const derived = cbmFromDimensions(input.lengthCm ?? 0, input.widthCm ?? 0, input.heightCm ?? 0);
  return derived > 0 ? derived : DEFAULT_ITEM_CBM;
}

export interface ShippingRates {
  /** Fallback domestic ₵/CBM when a specific route rate isn't configured. */
  defaultRatePerCbm: number;
  /** Configured domestic routes, keyed `${originHubId}|${destPickupId}` → ₵/CBM. */
  routes: Record<string, number>;
  /** International ₵/CBM per origin country code (e.g. CN, US). */
  intlRatePerCbm: Record<string, number>;
  /** Fallback international ₵/CBM for countries without a specific rate. */
  intlDefaultRatePerCbm: number;
  /** Pickup point where goods from abroad land, before the domestic leg. */
  arrivalHubId: string | null;
}

export interface ShippingLine {
  /** Per-unit CBM (already resolved via itemCbm). */
  cbm: number;
  quantity: number;
  /** The seller's origin/consolidation hub (a pickup-point id), or null. */
  originHubId: string | null;
  /** Origin country code: GH = domestic; anything else ships from abroad. */
  originCountry: string;
}

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** The domestic ₵/CBM rate for a route, falling back to the default. */
export function routeRatePerCbm(rates: ShippingRates, originHubId: string | null, destPickupId: string): number {
  if (originHubId) {
    const key = `${originHubId}|${destPickupId}`;
    if (key in rates.routes) return rates.routes[key];
    // Same-hub collection defaults to free when no explicit rate is set.
    if (originHubId === destPickupId) return 0;
  }
  return rates.defaultRatePerCbm;
}

/** Shipping fee for a single cart line to a chosen destination pickup point. */
export function lineShippingFee(line: ShippingLine, destPickupId: string, rates: ShippingRates): number {
  const totalCbm = (line.cbm > 0 ? line.cbm : DEFAULT_ITEM_CBM) * Math.max(1, line.quantity);
  const abroad = Boolean(line.originCountry) && line.originCountry !== "GH";

  if (abroad) {
    const intlRate = rates.intlRatePerCbm[line.originCountry] ?? rates.intlDefaultRatePerCbm;
    const intlLeg = intlRate * totalCbm;
    // Domestic leg from the arrival hub to the buyer's pickup point.
    const domRate = routeRatePerCbm(rates, rates.arrivalHubId, destPickupId);
    const domLeg = domRate * totalCbm;
    return round(intlLeg + domLeg);
  }

  return round(routeRatePerCbm(rates, line.originHubId, destPickupId) * totalCbm);
}

/** Total shipping fee for a cart to a chosen destination pickup point. */
export function quoteShipping(lines: ShippingLine[], destPickupId: string, rates: ShippingRates): number {
  if (!destPickupId) return 0;
  return round(lines.reduce((sum, l) => sum + lineShippingFee(l, destPickupId, rates), 0));
}

/** Total CBM of a cart (for display). */
export function totalCartCbm(lines: { cbm: number; quantity: number }[]): number {
  const t = lines.reduce((s, l) => s + (l.cbm > 0 ? l.cbm : DEFAULT_ITEM_CBM) * Math.max(1, l.quantity), 0);
  return Math.round(t * 1000) / 1000;
}
