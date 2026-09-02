import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  isPointKind,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Forwarder,
  type ShippingConfig,
  type ShippingDefaults,
  type ShippingRule,
} from "@/lib/shipping";

/**
 * Loading everything the shipping engine needs.
 *
 * Kept apart from the engine itself so the maths can run in a browser — the
 * seller's live estimate on the product form — while the queries stay on the
 * server. Every loader degrades to an empty list rather than throwing: a
 * database that cannot be reached should leave checkout quoting the platform
 * defaults, not answering with a 500.
 */

function numOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The platform-wide numbers, from site settings. */
export async function getShippingDefaults(): Promise<ShippingDefaults> {
  const s = await getSettings();
  return {
    baseFee: numOr(s.shipBaseFee, SHIPPING_DEFAULTS.baseFee),
    perKgRate: numOr(s.shipPerKgRate, SHIPPING_DEFAULTS.perKgRate),
    volumetricDivisor: numOr(s.shipVolumetricDivisor, SHIPPING_DEFAULTS.volumetricDivisor),
    minFee: numOr(s.shipMinFee, SHIPPING_DEFAULTS.minFee),
    importTaxRate: numOr(s.ghanaImportTaxRate, SHIPPING_DEFAULTS.importTaxRate),
    importDutyPercent: numOr(s.defaultImportDutyPercent, SHIPPING_DEFAULTS.importDutyPercent),
    fallbackRatePerCbm: numOr(s.shipFallbackRatePerCbm, SHIPPING_DEFAULTS.fallbackRatePerCbm),
  };
}

/**
 * Every consolidation point, active first.
 *
 * The table is still named `ArrivalPoint` — every listing, order line and
 * shipment already points at it, and migrations here are additive by rule. What
 * changed is what it means: not only where imports land, but anywhere a load is
 * gathered and checked. `hubPickupId` is the pickup station it sits at, and it
 * is what makes collection there free.
 */
export const getConsolidationPoints = cache(async (): Promise<ConsolidationPoint[]> => {
  try {
    const rows = await prisma.arrivalPoint.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      city: p.city,
      kind: isPointKind(p.kind) ? p.kind : "international",
      pickupPointId: p.hubPickupId,
      dutyPercent: p.dutyPercent,
      clearingFee: p.clearingFee,
      note: p.note,
      isActive: p.isActive,
    }));
  } catch {
    return [];
  }
});

/** Only the points a seller may choose. */
export async function getActiveConsolidationPoints(): Promise<ConsolidationPoint[]> {
  return (await getConsolidationPoints()).filter((p) => p.isActive);
}

/**
 * One point by id, or null. Inactive points are included on purpose: a listing
 * pointed at a retired point must keep pricing rather than silently go free.
 */
export async function getConsolidationPoint(
  id: string | null | undefined,
): Promise<ConsolidationPoint | null> {
  if (!id) return null;
  return (await getConsolidationPoints()).find((p) => p.id === id) ?? null;
}

/** A lookup keyed by id, for pricing a whole cart in one pass. */
export async function getConsolidationPointMap(): Promise<Map<string, ConsolidationPoint>> {
  return new Map((await getConsolidationPoints()).map((p) => [p.id, p]));
}

/** Every freight forwarder with its price list, active first. */
export const getForwarders = cache(async (): Promise<Forwarder[]> => {
  try {
    const rows = await prisma.freightForwarder.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { rates: { orderBy: [{ categoryId: "asc" }] } },
    });
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      originCountry: f.originCountry,
      mode: f.mode,
      consolidationPointId: f.consolidationPointId,
      allInclusive: f.allInclusive,
      note: f.note,
      isActive: f.isActive,
      rates: f.rates.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        label: r.label,
        ratePerCbm: r.ratePerCbm,
        ratePerKg: r.ratePerKg,
        minCharge: r.minCharge,
        transitDays: r.transitDays,
      })),
    }));
  } catch {
    return [];
  }
});

/** Only the forwarders a seller may choose. */
export async function getActiveForwarders(): Promise<Forwarder[]> {
  return (await getForwarders()).filter((f) => f.isActive);
}

/** A lookup keyed by id. Retired forwarders are included, as with points. */
export async function getForwarderMap(): Promise<Map<string, Forwarder>> {
  return new Map((await getForwarders()).map((f) => [f.id, f]));
}

/** Every domestic shipping rule. Resolution order is the engine's business. */
export const getShippingRules = cache(async (): Promise<ShippingRule[]> => {
  try {
    const rows = await prisma.shippingRule.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      originPointId: r.originPointId,
      destPickupId: r.destPickupId,
      categoryId: r.categoryId,
      flatFee: r.flatFee,
      baseFee: r.baseFee,
      perKgRate: r.perKgRate,
      note: r.note,
      isActive: r.isActive,
    }));
  } catch {
    return [];
  }
});

/** The defaults and the rules together — what the engine takes. */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const [defaults, rules] = await Promise.all([getShippingDefaults(), getShippingRules()]);
  return { defaults, rules };
}

/**
 * Whether the platform is configured well enough to quote anything.
 *
 * Shown on the Shipping overview, because the failure it catches is silent:
 * with no consolidation points, every listing prices from the platform defaults
 * and no collection is ever free, which looks like working software right up
 * until a buyer is charged to collect from the shelf the goods are sitting on.
 */
export interface ShippingHealth {
  points: number;
  localPoints: number;
  internationalPoints: number;
  pointsAtPickup: number;
  pickupPoints: number;
  rules: number;
  forwarders: number;
  forwardersWithRates: number;
  /** Listings from abroad that no forwarder and no supplier delivery covers. */
  unpricedListings: number;
}

export async function getShippingHealth(): Promise<ShippingHealth> {
  try {
    const [points, forwarders, rules, pickupPoints, unpriced] = await Promise.all([
      getConsolidationPoints(),
      getForwarders(),
      prisma.shippingRule.count(),
      prisma.pickupPoint.count({ where: { isActive: true } }),
      prisma.product.count({
        where: {
          isArchived: false,
          shippingMethod: "auto",
          supplierDelivers: false,
          forwarderId: null,
          // Imported, by the listing's own origin. `notIn` rather than a `NOT`
          // list: Prisma reads `NOT: [a, b]` as NOT (a AND b), which every row
          // satisfies and which would report every listing as unpriced.
          originCountry: { notIn: ["", "GH"] },
        },
      }),
    ]);
    return {
      points: points.length,
      localPoints: points.filter((p) => p.kind === "local").length,
      internationalPoints: points.filter((p) => p.kind === "international").length,
      pointsAtPickup: points.filter((p) => p.pickupPointId).length,
      pickupPoints,
      rules,
      forwarders: forwarders.length,
      forwardersWithRates: forwarders.filter((f) => f.rates.length > 0).length,
      unpricedListings: unpriced,
    };
  } catch {
    return {
      points: 0,
      localPoints: 0,
      internationalPoints: 0,
      pointsAtPickup: 0,
      pickupPoints: 0,
      rules: 0,
      forwarders: 0,
      forwardersWithRates: 0,
      unpricedListings: 0,
    };
  }
}
