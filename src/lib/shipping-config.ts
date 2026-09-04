import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  currencyRatesFrom,
  DEFAULT_CURRENCIES,
  DEFAULT_FORWARDER_CURRENCY,
  HOME_CURRENCY,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Currency,
  type CurrencyRates,
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
    perUnitFee: numOr(s.shipPerUnitFee, SHIPPING_DEFAULTS.perUnitFee),
    perKgRate: numOr(s.shipPerKgRate, SHIPPING_DEFAULTS.perKgRate),
    volumetricDivisor: numOr(s.shipVolumetricDivisor, SHIPPING_DEFAULTS.volumetricDivisor),
    minFee: numOr(s.shipMinFee, SHIPPING_DEFAULTS.minFee),
  };
}

const POINT_SELECT = {
  id: true,
  name: true,
  code: true,
  city: true,
  address: true,
  kind: true,
  forwarderId: true,
  hubPickupId: true,
  note: true,
  isActive: true,
} as const;

type PointRow = {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  kind: string;
  forwarderId: string | null;
  hubPickupId: string | null;
  note: string;
  isActive: boolean;
};

/**
 * The kind is derived, never trusted.
 *
 * A point that belongs to a forwarder is an international one whatever the
 * stored string says, and one that belongs to nobody is ours. Keeping the two
 * in step in code rather than in data is what stops a forwarder's warehouse
 * from turning up in the local points list after somebody edits a row.
 */
function toPoint(p: PointRow): ConsolidationPoint {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    city: p.city,
    address: p.address,
    kind: p.forwarderId ? "international" : "local",
    forwarderId: p.forwarderId,
    pickupPointId: p.hubPickupId,
    note: p.note,
    isActive: p.isActive,
  };
}

/**
 * Every consolidation point, active first.
 *
 * The table is still named `ArrivalPoint` — every listing, order line and
 * shipment already points at it, and migrations here are additive by rule.
 * `pickupPointId` is the station it sits at, and it is what makes collection
 * there free.
 */
export const getConsolidationPoints = cache(async (): Promise<ConsolidationPoint[]> => {
  try {
    const rows = await prisma.arrivalPoint.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: POINT_SELECT,
    });
    return rows.map(toPoint);
  } catch {
    return [];
  }
});

/** Only the points a seller may choose. */
export async function getActiveConsolidationPoints(): Promise<ConsolidationPoint[]> {
  return (await getConsolidationPoints()).filter((p) => p.isActive);
}

/** NikiMart's own points — the ones the consolidation-points screen owns. */
export async function getLocalConsolidationPoints(): Promise<ConsolidationPoint[]> {
  return (await getConsolidationPoints()).filter((p) => !p.forwarderId);
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

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

/**
 * Every currency the platform knows, with the seeded set filling any gap.
 *
 * A fresh install has an empty table and forwarders quoting in dollars, so
 * returning nothing would silently convert every USD rate one-for-one. The
 * defaults are indicative figures an admin is expected to correct — visible and
 * wrong beats invisible and wrong.
 */
export const getCurrencies = cache(async (): Promise<Currency[]> => {
  try {
    const rows = await prisma.currency.findMany({ orderBy: [{ code: "asc" }] });
    const known = new Map(
      rows.map((r) => [
        r.code.toUpperCase(),
        {
          code: r.code.toUpperCase(),
          name: r.name,
          symbol: r.symbol,
          rateToGhs: r.rateToGhs,
          isActive: r.isActive,
          autoUpdate: r.autoUpdate,
          source: r.source,
        } satisfies Currency,
      ]),
    );
    for (const seed of DEFAULT_CURRENCIES) {
      if (!known.has(seed.code)) known.set(seed.code, seed);
    }
    return [...known.values()].sort((a, b) =>
      a.code === HOME_CURRENCY ? -1 : b.code === HOME_CURRENCY ? 1 : a.code.localeCompare(b.code),
    );
  } catch {
    return [...DEFAULT_CURRENCIES];
  }
});

/** Only the currencies an admin may quote a lane in. */
export async function getActiveCurrencies(): Promise<Currency[]> {
  return (await getCurrencies()).filter((c) => c.isActive);
}

/** The code → GH₵-per-unit lookup the engine takes. */
export async function getCurrencyRates(): Promise<CurrencyRates> {
  return currencyRatesFrom(await getCurrencies());
}

// ---------------------------------------------------------------------------
// Forwarders
// ---------------------------------------------------------------------------

/** Every freight forwarder with their points, classes, lanes and grid. */
export const getForwarders = cache(async (): Promise<Forwarder[]> => {
  try {
    const rows = await prisma.freightForwarder.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        consolidations: { orderBy: [{ name: "asc" }], select: POINT_SELECT },
        goodsClasses: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        categoryMap: true,
        routes: {
          orderBy: [{ isDefault: "desc" }, { mode: "asc" }, { name: "asc" }],
          include: { rates: true },
        },
      },
    });
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      ghanaAddress: f.ghanaAddress,
      contactName: f.contactName,
      contactPhone: f.contactPhone,
      contactEmail: f.contactEmail,
      originCountry: f.originCountry,
      collectionAddress: f.collectionAddress,
      collectionCity: f.collectionCity,
      currency: f.currency || DEFAULT_FORWARDER_CURRENCY,
      note: f.note,
      terms: f.terms,
      isActive: f.isActive,
      consolidations: f.consolidations.map(toPoint),
      goodsClasses: f.goodsClasses.map((g) => ({
        id: g.id,
        name: g.name,
        note: g.note,
        levyCbm: g.levyCbm,
        levyLabel: g.levyLabel,
        sortOrder: g.sortOrder,
        isDefault: g.isDefault,
      })),
      categoryMap: Object.fromEntries(f.categoryMap.map((m) => [m.categoryId, m.goodsClassId])),
      routes: f.routes.map((r) => ({
        id: r.id,
        forwarderId: r.forwarderId,
        name: r.name,
        mode: r.mode,
        destinationPointId: r.destinationPointId,
        currency: r.currency || f.currency || DEFAULT_FORWARDER_CURRENCY,
        minDays: r.minDays,
        maxDays: r.maxDays,
        minCbm: r.minCbm,
        orderFrequency: r.orderFrequency,
        orderFrequencyDetail: r.orderFrequencyDetail,
        note: r.note,
        isActive: r.isActive,
        isDefault: r.isDefault,
        rates: r.rates.map((rr) => ({
          id: rr.id,
          goodsClassId: rr.goodsClassId,
          ratePerCbm: rr.ratePerCbm,
          isAvailable: rr.isAvailable,
          note: rr.note,
        })),
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
      baseFee: r.baseFee,
      perUnitFee: r.perUnitFee,
      flatFee: r.flatFee,
      perKgRate: r.perKgRate,
      note: r.note,
      isActive: r.isActive,
    }));
  } catch {
    return [];
  }
});

/** The defaults, the rules and the exchange rates — what the engine takes. */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const [defaults, rules, currencies] = await Promise.all([
    getShippingDefaults(),
    getShippingRules(),
    getCurrencyRates(),
  ]);
  return { defaults, rules, currencies };
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
  /** NikiMart's own points. */
  localPoints: number;
  /** Points belonging to a forwarder. */
  forwarderPoints: number;
  pointsAtPickup: number;
  pickupPoints: number;
  rules: number;
  forwarders: number;
  /** Forwarders that can actually quote: a lane with at least one price on it. */
  forwardersWithRates: number;
  routes: number;
  currencies: number;
  /** Currencies quoted by a lane whose exchange rate is still at 1:1. */
  unratedCurrencies: string[];
  /** Listings from abroad that no priced lane and no supplier delivery covers. */
  unpricedListings: number;
}

export async function getShippingHealth(): Promise<ShippingHealth> {
  try {
    const [points, forwarders, currencies, rules, pickupPoints, unpriced] = await Promise.all([
      getConsolidationPoints(),
      getForwarders(),
      getCurrencies(),
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

    const priced = (f: Forwarder) =>
      f.routes.some((r) => r.isActive && r.rates.some((x) => x.isAvailable && x.ratePerCbm > 0));

    // A lane quoted in a currency nobody has priced converts one-for-one, which
    // turns $260 into GH₵260. Worth saying out loud on the overview.
    const rateByCode = new Map(currencies.map((c) => [c.code, c.rateToGhs]));
    const unrated = new Set<string>();
    for (const f of forwarders) {
      for (const r of f.routes) {
        const code = (r.currency || f.currency || HOME_CURRENCY).toUpperCase();
        if (code !== HOME_CURRENCY && (rateByCode.get(code) ?? 1) === 1) unrated.add(code);
      }
    }

    return {
      localPoints: points.filter((p) => !p.forwarderId).length,
      forwarderPoints: points.filter((p) => p.forwarderId).length,
      pointsAtPickup: points.filter((p) => p.pickupPointId).length,
      pickupPoints,
      rules,
      forwarders: forwarders.length,
      forwardersWithRates: forwarders.filter(priced).length,
      routes: forwarders.reduce((s, f) => s + f.routes.length, 0),
      currencies: currencies.length,
      unratedCurrencies: [...unrated].sort(),
      unpricedListings: unpriced,
    };
  } catch {
    return {
      localPoints: 0,
      forwarderPoints: 0,
      pointsAtPickup: 0,
      pickupPoints: 0,
      rules: 0,
      forwarders: 0,
      forwardersWithRates: 0,
      routes: 0,
      currencies: 0,
      unratedCurrencies: [],
      unpricedListings: 0,
    };
  }
}

/**
 * How long goods from one country take to reach Ghana, in days.
 *
 * Read off the forwarders themselves — the longest delivery estimate on any
 * live lane out of that country — rather than a platform setting somebody has
 * to remember to keep in step with them. A country nobody collects in falls
 * back to three weeks, which is what a shopper is shown while the first
 * forwarder for it is being set up.
 */
export const DEFAULT_LEAD_DAYS = 21;

export async function getLeadDays(countryCode: string): Promise<number> {
  const code = (countryCode || "").toUpperCase();
  if (!code) return DEFAULT_LEAD_DAYS;
  const forwarders = await getActiveForwarders();
  const days = forwarders
    .filter((f) => f.originCountry.toUpperCase() === code)
    .flatMap((f) => f.routes.filter((r) => r.isActive).map((r) => r.maxDays || r.minDays))
    .filter((d) => d > 0);
  return days.length > 0 ? Math.max(...days) : DEFAULT_LEAD_DAYS;
}
