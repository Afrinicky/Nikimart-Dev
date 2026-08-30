/**
 * Ghana arrival points — where goods from abroad land before the domestic leg.
 *
 * Leg 2 of a shipped-from-abroad order ends here: the forwarder puts the
 * consignment on a plane or a ship, and it comes off at Tema Port, or KIA's
 * cargo village, or a consolidator's Kumasi warehouse. Which one matters to the
 * bill twice over — the sea rate into Tema is nothing like the air rate into
 * Accra, and the domestic leg that follows starts from a different place — so
 * the points are admin-configured, priced per origin and per mode, and the
 * seller picks one when they list the product.
 *
 * Pure: rate resolution runs identically in the seller's form (live estimate)
 * and in the order action (authoritative re-price).
 */

// Type-only, so it is erased before Node sees it and needs no path mapping.
import type { FreightMode } from "@/lib/abroad";

/** A rate row: what it costs to bring one consignment to this point. */
export interface ArrivalRate {
  /** Origin country code (CN, AE, US, EU…), or "*" for any origin. */
  originCountry: string;
  /** Freight mode this row prices, or "*" for any mode. */
  mode: string;
  /** GH₵ per cubic metre — how sea freight is normally sold. */
  ratePerCbm: number;
  /** GH₵ per kilogram — how air freight is normally sold. */
  ratePerKg: number;
  /** The floor: no consignment on this route is billed under this. */
  minCharge: number;
  /** Typical days in transit on this route, for the arrival estimate. */
  transitDays: number;
}

/** A Ghana point, with everything needed to price a landing there. */
export interface ArrivalPointConfig {
  id: string;
  name: string;
  code: string;
  city: string;
  /** Ghana import duty, as a percent of the CIF value. */
  dutyPercent: number;
  /** Flat clearing / handling charge (GH₵) per order line landing here. */
  clearingFee: number;
  /** The pickup point the domestic leg starts from. Null = the site default. */
  hubPickupId: string | null;
  isActive: boolean;
  rates: ArrivalRate[];
}

/** The wildcard used in a rate row's originCountry / mode. */
export const ANY = "*";

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/**
 * The rate for an origin and mode at this point, most specific first.
 *
 * A point with a China air rate and a catch-all sea rate is the normal shape,
 * so the search widens one axis at a time rather than demanding an exact row:
 * exact → any-origin → any-mode → the catch-all. Null when the point prices
 * nothing that could carry this consignment, which is a real answer: the
 * caller shows "this route isn't priced yet" instead of quoting zero.
 */
export function resolveArrivalRate(
  point: Pick<ArrivalPointConfig, "rates">,
  originCountry: string,
  mode: FreightMode | string,
): ArrivalRate | null {
  const origin = (originCountry || "").toUpperCase();
  const candidates: [string, string][] = [
    [origin, mode],
    [ANY, mode],
    [origin, ANY],
    [ANY, ANY],
  ];
  for (const [c, m] of candidates) {
    const hit = point.rates.find(
      (r) => (r.originCountry || ANY).toUpperCase() === c && (r.mode || ANY) === m,
    );
    if (hit) return hit;
  }
  return null;
}

/**
 * Leg 2 for one line: forwarder abroad → this Ghana point.
 *
 * Air is sold by the kilo and sea by the cubic metre, and a rate row may carry
 * both — a forwarder who charges volumetric weight on top of a CBM rate is
 * ordinary — so both are applied and the minimum charge is a floor under the
 * sum, not an alternative to it.
 */
export function internationalFreight(
  rate: ArrivalRate | null,
  cbm: number,
  weightKg: number,
  quantity: number,
): number {
  if (!rate) return 0;
  const qty = Math.max(1, quantity);
  const byVolume = rate.ratePerCbm * Math.max(0, cbm) * qty;
  const byWeight = rate.ratePerKg * Math.max(0, weightKg) * qty;
  return round(Math.max(byVolume + byWeight, rate.minCharge));
}

/** A point's label for a picker: "Tema Port — Tema". */
export function describeArrivalPoint(point: Pick<ArrivalPointConfig, "name" | "city">): string {
  return point.city ? `${point.name} — ${point.city}` : point.name;
}
