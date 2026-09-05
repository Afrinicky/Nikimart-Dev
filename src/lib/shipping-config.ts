import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  currencyRatesFrom,
  DEFAULT_CURRENCIES,
  DEFAULT_FORWARDER_CURRENCY,
  HOME_CURRENCY,
  LARGE_ITEM_DEFAULTS,
  SHIPPING_DEFAULTS,
  type ConsolidationPoint,
  type Currency,
  type CurrencyRates,
  type Forwarder,
  locationKeyForPickup,
  locationKeyForPoint,
  type LaneFee,
  type LargeItemPolicy,
  type ShippingConfig,
  type ShippingDefaults,
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
        sortOrder: g.sortOrder,
        isDefault: g.isDefault,
      })),
      // One category, every class it falls into. Two rows for the same
      // category is the normal case now, not a duplicate.
      categoryMap: f.categoryMap.reduce<Record<string, string[]>>((acc, m) => {
        (acc[m.categoryId] ??= []).push(m.goodsClassId);
        return acc;
      }, {}),
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

// ---------------------------------------------------------------------------
// Locations: the rows and columns of the grid
// ---------------------------------------------------------------------------

/**
 * One place goods pass through, and the roles it plays.
 *
 * The two tables behind this are a historical split, not a real one: a pickup
 * station is where a buyer collects, a consolidation point is where goods
 * gather, and one building is usually both. This is the merged view — one entry
 * per place — and it is what the grid's rows and columns are drawn from, so a
 * new station or a new depot becomes a row and a column the moment it is
 * created, with nothing to configure and nothing hardcoded.
 */
export interface ShippingLocation {
  /** The engine's key for this place: "pp:<id>" or "cp:<id>". */
  key: string;
  name: string;
  code: string;
  /** Town or campus, when the record carries one. */
  where: string;
  /** True when buyers can collect here. */
  isPickup: boolean;
  /** True when goods gather here. */
  isConsolidation: boolean;
  /** The forwarder who owns it, when it is theirs rather than ours. */
  ownerName: string;
  /** The PickupPoint row, when this place is one. */
  pickupPointId: string | null;
  /** The ArrivalPoint row, when this place is one. */
  consolidationPointId: string | null;
  isActive: boolean;
}

/**
 * Every location, merged, active first and then alphabetical.
 *
 * A consolidation point that sits at a pickup station is folded into that
 * station rather than listed beside it: one place, one row, one price for a run
 * out of it. A point that sits at no station keeps its own entry, which is how a
 * forwarder's warehouse comes to be a row of the grid.
 */
export const getShippingLocations = cache(async (): Promise<ShippingLocation[]> => {
  try {
    const [pickups, points, forwarders] = await Promise.all([
      prisma.pickupPoint.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, name: true, code: true, locationName: true, isActive: true },
      }),
      getConsolidationPoints(),
      prisma.freightForwarder.findMany({ select: { id: true, name: true } }),
    ]);

    const forwarderName = new Map(forwarders.map((f) => [f.id, f.name]));
    const atStation = new Map(
      points.filter((p) => p.pickupPointId).map((p) => [p.pickupPointId as string, p]),
    );

    const fromPickups: ShippingLocation[] = pickups.map((s) => {
      const point = atStation.get(s.id) ?? null;
      return {
        key: locationKeyForPickup(s.id),
        name: s.name,
        code: s.code,
        where: s.locationName,
        isPickup: true,
        isConsolidation: Boolean(point),
        ownerName: point?.forwarderId ? (forwarderName.get(point.forwarderId) ?? "A forwarder") : "",
        pickupPointId: s.id,
        consolidationPointId: point?.id ?? null,
        // A station whose depot is retired still takes collections, so the
        // station's own status is the one that counts.
        isActive: s.isActive,
      };
    });

    const standalone: ShippingLocation[] = points
      .filter((p) => !p.pickupPointId)
      .map((p) => ({
        key: locationKeyForPoint(p),
        name: p.name,
        code: p.code,
        where: p.city,
        isPickup: false,
        isConsolidation: true,
        ownerName: p.forwarderId ? (forwarderName.get(p.forwarderId) ?? "A forwarder") : "",
        pickupPointId: null,
        consolidationPointId: p.id,
        isActive: p.isActive,
      }));

    return [...fromPickups, ...standalone].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
});

/** A location by key. */
export async function getShippingLocation(key: string): Promise<ShippingLocation | null> {
  return (await getShippingLocations()).find((l) => l.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/** A stored cell, with both ends resolved to the location they address. */
export interface RawLaneFee extends LaneFee {
  /** When it was last written. Used to settle two rows naming one journey. */
  updatedAt: Date;
}

/**
 * Every stored cell, canonical keys attached, duplicates and all.
 *
 * Two rows can name one journey without the database noticing. A cell written
 * before locations were merged addresses "the depot at Sunyani station"; one
 * written after addresses "Sunyani station" — different columns, so the unique
 * index sees two different lanes, and they are the same run. Only the
 * application knows that, so only the application can settle it.
 *
 * This is the unsettled list, which the grid's save needs so it can clear the
 * losers. Everything else wants `getShippingLaneFees`.
 */
export const getRawShippingLaneFees = cache(async (): Promise<RawLaneFee[]> => {
  try {
    const [rows, points] = await Promise.all([
      prisma.shippingLaneFee.findMany({ orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }] }),
      getConsolidationPoints(),
    ]);
    const pointById = new Map(points.map((p) => [p.id, p]));

    const keyOf = (pickupId: string | null, pointId: string | null): string => {
      if (pickupId) return locationKeyForPickup(pickupId);
      if (!pointId) return "";
      // A point we cannot find is still a point: address it by its own id
      // rather than dropping the price somebody typed.
      return locationKeyForPoint(pointById.get(pointId) ?? { id: pointId, pickupPointId: null });
    };

    return rows
      .map((r) => ({
        id: r.id,
        originKey: keyOf(r.originPickupId, r.originPointId),
        destKey: keyOf(r.destPickupId, r.destPointId),
        baseFee: r.baseFee,
        perUnitFee: r.perUnitFee,
        largeRatePerCbm: r.largeRatePerCbm,
        largeMinFee: r.largeMinFee,
        note: r.note,
        isActive: r.isActive,
        updatedAt: r.updatedAt,
      }))
      .filter((l) => l.originKey && l.destKey);
  } catch {
    return [];
  }
});

/**
 * The grid: one cell per journey.
 *
 * Where two stored rows name the same run — see above — the most recently
 * written one wins, because that is the number the admin last looked at and
 * meant. Saving that journey again clears the loser for good.
 *
 * The whole table, not the active rows only: the engine skips a paused lane
 * itself, and the admin grid needs the paused ones to draw the cell somebody
 * typed a number into.
 */
export async function getShippingLaneFees(): Promise<LaneFee[]> {
  const settled = new Map<string, LaneFee>();
  // Oldest first, so a later write replaces an earlier one for the same run.
  for (const lane of await getRawShippingLaneFees()) {
    settled.set(`${lane.originKey}|${lane.destKey}`, lane);
  }
  return [...settled.values()];
}

/**
 * When an item counts as large, and what a cubic metre of it costs.
 *
 * `shipLargeRatePerCbm` deliberately falls back to zero rather than to a
 * guessed rate: an unpriced policy leaves large goods on the ordinary flat base
 * fee, which is wrong by a little, where a made-up rate per cubic metre would
 * be wrong by whatever a fridge happens to measure.
 */
export async function getLargeItemPolicy(): Promise<LargeItemPolicy> {
  const s = await getSettings();
  return {
    enabled: !["0", "off", "false", "no"].includes(s.shipLargeEnabled.trim().toLowerCase()),
    minLongestSideCm: numOr(s.shipLargeMinLongestCm, LARGE_ITEM_DEFAULTS.minLongestSideCm),
    minCbm: numOr(s.shipLargeMinCbm, LARGE_ITEM_DEFAULTS.minCbm),
    minWeightKg: numOr(s.shipLargeMinWeightKg, LARGE_ITEM_DEFAULTS.minWeightKg),
    ratePerCbm: numOr(s.shipLargeRatePerCbm, 0),
    minFee: numOr(s.shipLargeMinFee, 0),
    extraPercent: Math.min(numOr(s.shipLargeExtraPercent, LARGE_ITEM_DEFAULTS.extraPercent), 100),
  };
}

/** The defaults, the grid and the exchange rates — what the engine takes. */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const [defaults, lanes, large, currencies] = await Promise.all([
    getShippingDefaults(),
    getShippingLaneFees(),
    getLargeItemPolicy(),
    getCurrencyRates(),
  ]);
  return { defaults, lanes, large, currencies };
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
  /** Places on the grid: stations, depots, and the buildings that are both. */
  locations: number;
  /** Cells of the grid that carry a price. */
  laneFees: number;
  /** Journeys the grid could price and nobody has. */
  unpricedLanes: number;
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
    const [points, forwarders, currencies, locations, laneFees, pickupPoints, unpriced] =
      await Promise.all([
        getConsolidationPoints(),
        getForwarders(),
        getCurrencies(),
        getShippingLocations(),
        getShippingLaneFees(),
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

    // Every live location to every other one. A place to itself is not a
    // journey — that is collecting where the goods already sit, which is free.
    const live = locations.filter((l) => l.isActive);
    const journeys = live.length * Math.max(0, live.length - 1);

    return {
      localPoints: points.filter((p) => !p.forwarderId).length,
      forwarderPoints: points.filter((p) => p.forwarderId).length,
      pointsAtPickup: points.filter((p) => p.pickupPointId).length,
      pickupPoints,
      locations: locations.length,
      laneFees: laneFees.length,
      unpricedLanes: Math.max(0, journeys - laneFees.filter((l) => l.isActive).length),
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
      locations: 0,
      laneFees: 0,
      unpricedLanes: 0,
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
