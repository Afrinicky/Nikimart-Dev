// NikiMart delivery-fee engine — a Jumia-style calculation that prices door
// delivery from the billable weight of the cart and a destination zone
// multiplier, while pickup-station collection is a flat (usually cheaper) fee.
//
// This module is pure (no server-only imports) so it can run on both the
// client (live checkout estimate) and the server (authoritative re-price).
// Configuration is loaded from site settings via getDeliveryConfig() in
// settings.ts and passed in here.

export interface DeliveryConfig {
  /** Flat base charged on every door delivery, before the weight component. */
  baseFee: number;
  /** GH₵ charged per billable kilogram of the consignment. */
  perKgRate: number;
  /** Flat fee to collect from a pickup station (0 = free). */
  pickupFee: number;
}

export const DELIVERY_DEFAULTS: DeliveryConfig = {
  baseFee: 20,
  perKgRate: 5,
  pickupFee: 0,
};

/** Fallback billable weight (kg) when a product has none recorded. */
export const DEFAULT_ITEM_WEIGHT_KG = 0.5;

export type DeliveryMethod = "delivery" | "pickup";

export interface DeliveryQuoteInput {
  method: DeliveryMethod;
  /** Total billable weight of the cart in kilograms. */
  totalWeightKg: number;
  /** Destination zone multiplier (1 = standard, <1 nearer, >1 farther). */
  zoneMultiplier: number;
  config: DeliveryConfig;
}

/** Round a fee to 2 decimals and clamp to ≥ 0. */
function roundFee(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/**
 * Billable weight, rounded up to the next 0.5 kg the way couriers charge.
 * A 0.6 kg parcel is billed at 1 kg.
 */
export function billableWeight(weightKg: number): number {
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  return Math.ceil(w * 2) / 2;
}

/**
 * The delivery fee for a consignment.
 *   delivery = (baseFee + perKgRate × billableWeight) × zoneMultiplier
 *   pickup   = flat pickupFee
 */
export function quoteDeliveryFee({ method, totalWeightKg, zoneMultiplier, config }: DeliveryQuoteInput): number {
  if (method === "pickup") {
    return roundFee(config.pickupFee);
  }
  const weight = billableWeight(totalWeightKg);
  const zone = Number.isFinite(zoneMultiplier) && zoneMultiplier > 0 ? zoneMultiplier : 1;
  return roundFee((config.baseFee + config.perKgRate * weight) * zone);
}

/** Sum billable weights for a set of cart lines, applying the default fallback. */
export function totalCartWeight(items: { weightKg?: number; quantity: number }[]): number {
  return items.reduce((sum, i) => {
    const w = typeof i.weightKg === "number" && i.weightKg > 0 ? i.weightKg : DEFAULT_ITEM_WEIGHT_KG;
    return sum + w * i.quantity;
  }, 0);
}
