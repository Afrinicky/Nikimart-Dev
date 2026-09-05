"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { refreshCurrencyRates } from "@/lib/fx";
import { parseLocationKey } from "@/lib/shipping";
import { getRawShippingLaneFees, type RawLaneFee } from "@/lib/shipping-config";

/**
 * Everything an admin can change about shipping *inside Ghana*, in one module.
 *
 * The forwarders are not here. A forwarder is a company with a rate sheet, and
 * their whole profile — warehouses, classes, lanes and prices — is saved as one
 * thing by `lib/forwarder-actions`. What is left in this module is the part of
 * the system NikiMart owns: the grid that prices every run between two places,
 * the platform defaults behind its empty cells, and the exchange rates the
 * forwarders' quotes are converted at.
 *
 * All of it is admin-only, and deliberately so. Sellers choose from these
 * lists; only admins write them.
 *
 * The places themselves — every station buyers collect at, every point goods
 * gather at, and the many that are both — are one merged concern and live in
 * `lib/shipping-location-actions`.
 */

export type ShippingState = {
  ok?: boolean;
  error?: string;
  /** What happened, when "Saved ✓" is not specific enough to be useful. */
  message?: string;
  fieldErrors?: Record<string, string>;
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function on(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

/**
 * Everything a shipping change can move.
 *
 * A rate is read at checkout, on the product page, in the seller's estimate and
 * on every page that quotes a collection, so a change that revalidated only the
 * admin screen would leave the old number on the pages that matter.
 */
function revalidateShipping() {
  revalidatePath("/admin/shipping", "layout");
  revalidatePath("/admin/purchasing", "layout");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/pickup-points");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/products", "layout");
}

// ---------------------------------------------------------------------------
// Platform defaults
// ---------------------------------------------------------------------------

/**
 * The setting keys this console owns. Nothing else writes them.
 *
 * The duty, VAT and lead-time keys are gone. A forwarder's rate per cubic metre
 * is the whole cost of the leg and their lanes carry their own delivery
 * estimates, so a platform-wide figure beside either could only contradict it.
 */
const DEFAULT_KEYS = [
  "shipBaseFee",
  "shipPerUnitFee",
  "shipPerKgRate",
  "shipVolumetricDivisor",
  "shipMinFee",
  "shipDefaultPointId",
  "shipPayOnPickupEnabled",
  "shipLargeEnabled",
  "shipLargeMinLongestCm",
  "shipLargeMinCbm",
  "shipLargeMinWeightKg",
  "shipLargeRatePerCbm",
  "shipLargeMinFee",
  "shipLargeExtraPercent",
  "abroadPageTitle",
  "abroadPageIntro",
] as const;

const AMOUNT_KEYS: Record<string, string> = {
  shipBaseFee: "Base fee",
  shipPerUnitFee: "Additional-unit fee",
  shipPerKgRate: "Per-kg rate",
  shipVolumetricDivisor: "Volumetric divisor",
  shipMinFee: "Minimum fee",
  shipLargeMinLongestCm: "Large-item longest side",
  shipLargeMinCbm: "Large-item volume",
  shipLargeMinWeightKg: "Large-item weight",
  shipLargeRatePerCbm: "Large-item rate per m³",
  shipLargeMinFee: "Large-item minimum fee",
  shipLargeExtraPercent: "Each additional large item",
};

/**
 * Save the platform defaults.
 *
 * Only keys the form actually submitted are written. The console is several
 * screens and each posts its own section; writing every key would let one
 * screen blank another's settings.
 */
export async function saveShippingDefaults(
  _prev: ShippingState,
  fd: FormData,
): Promise<ShippingState> {
  await requireAdmin();

  for (const [key, label] of Object.entries(AMOUNT_KEYS)) {
    const v = str(fd, key);
    if (v && !(Number(v) >= 0)) {
      return { error: `${label} must be a number ≥ 0.`, fieldErrors: { [key]: "Invalid amount." } };
    }
  }
  // A divisor of zero would divide every volumetric weight by nothing. The
  // engine guards against it, but a saved zero is still a wrong number sitting
  // in the console where somebody will later read it as the truth.
  const divisor = str(fd, "shipVolumetricDivisor");
  if (divisor && Number(divisor) <= 0) {
    return {
      error: "The volumetric divisor must be greater than zero (couriers use 5000).",
      fieldErrors: { shipVolumetricDivisor: "Must be above zero." },
    };
  }

  // A share above 100% would charge a second fridge more than a first one,
  // which is the opposite of what an increment is.
  const share = str(fd, "shipLargeExtraPercent");
  if (share && Number(share) > 100) {
    return {
      error: "Each additional large item is a share of its own size-based price — 100% at most.",
      fieldErrors: { shipLargeExtraPercent: "100 or less." },
    };
  }

  for (const key of DEFAULT_KEYS) {
    if (!fd.has(key)) continue;
    const value = str(fd, key);
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  revalidateShipping();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/**
 * One optional amount from a grid cell.
 *
 * The empty string is not zero here and the difference is the whole design: a
 * blank cell has no opinion and falls back to the platform default, while a
 * typed zero says this journey is free, or adds nothing per extra item.
 */
function cell(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The four columns that address one lane, from its two location keys. */
interface LaneColumns {
  originPickupId: string | null;
  originPointId: string | null;
  destPickupId: string | null;
  destPointId: string | null;
}

function laneColumns(originKey: string, destKey: string): LaneColumns | null {
  const origin = parseLocationKey(originKey);
  const dest = parseLocationKey(destKey);
  if (!origin || !dest) return null;
  return {
    originPickupId: origin.kind === "pickup" ? origin.id : null,
    originPointId: origin.kind === "point" ? origin.id : null,
    destPickupId: dest.kind === "pickup" ? dest.id : null,
    destPointId: dest.kind === "point" ? dest.id : null,
  };
}

/**
 * Save the whole grid in one go.
 *
 * A grid is edited as a grid: an admin fills in a column of stations, presses
 * save once, and every cell they touched is written together. Saving cell by
 * cell would mean twenty round trips to price one new location, and a
 * half-finished grid whenever one of them failed.
 *
 * A cell emptied of everything is deleted rather than stored as a row of
 * zeroes, because a row of zeroes is a journey quoted free — the opposite of
 * what clearing a cell means.
 */
export async function saveShippingLaneFees(
  _prev: ShippingState,
  fd: FormData,
): Promise<ShippingState> {
  await requireAdmin();

  // The cells the form actually rendered. Reading the pairs off the base-fee
  // inputs rather than off a submitted list of ids keeps the two in step: a
  // location added since the page loaded simply is not in this save.
  const pairs: { originKey: string; destKey: string }[] = [];
  for (const field of fd.keys()) {
    if (!field.startsWith("base|")) continue;
    const [, originKey, destKey] = field.split("|");
    if (originKey && destKey) pairs.push({ originKey, destKey });
  }
  if (pairs.length === 0) return { error: "Nothing to save — the grid had no cells." };

  // Keyed by the journey each row actually addresses, not by the columns it
  // happens to use: a cell written before locations were merged names its
  // origin as the depot, a newer one names the station it sits at, and those
  // are the same run. Both land in the same bucket here, and the save keeps one.
  const existing = await getRawShippingLaneFees();
  const stored = new Map<string, RawLaneFee[]>();
  for (const row of existing) {
    const k = `${row.originKey}|${row.destKey}`;
    stored.set(k, [...(stored.get(k) ?? []), row]);
  }

  // Only the cells that actually moved are written. A grid of twenty locations
  // is four hundred cells and an admin edits three of them; sending four
  // hundred writes for that would make one corrected fee a slow, risky save.
  const writes = [];
  let changed = 0;
  let cleared = 0;

  for (const { originKey, destKey } of pairs) {
    const columns = laneColumns(originKey, destKey);
    if (!columns) continue;

    const suffix = `${originKey}|${destKey}`;
    // The row that answers for this journey today, and any older ones saying
    // the same thing differently. Saving heals the duplication: one row is
    // kept and the rest go, so nothing is left for a future read to choose
    // between.
    const [row, ...duplicates] = [...(stored.get(suffix) ?? [])].reverse();
    for (const extra of duplicates) {
      writes.push(prisma.shippingLaneFee.delete({ where: { id: extra.id } }));
    }

    const baseFee = cell(fd, `base|${suffix}`);
    const perUnitFee = cell(fd, `unit|${suffix}`);
    const largeRatePerCbm = cell(fd, `cbm|${suffix}`) ?? 0;
    const largeMinFee = cell(fd, `min|${suffix}`) ?? 0;

    // Emptied of everything: the cell goes, rather than being stored as a row
    // of zeroes — which would be this journey quoted free, the opposite of what
    // clearing a cell means.
    if (baseFee === null && perUnitFee === null && largeRatePerCbm === 0 && largeMinFee === 0) {
      if (!row) continue;
      cleared += 1;
      writes.push(prisma.shippingLaneFee.delete({ where: { id: row.id } }));
      continue;
    }

    if (
      row &&
      duplicates.length === 0 &&
      row.baseFee === baseFee &&
      row.perUnitFee === perUnitFee &&
      row.largeRatePerCbm === largeRatePerCbm &&
      row.largeMinFee === largeMinFee
    ) {
      continue;
    }

    changed += 1;
    writes.push(
      row
        ? prisma.shippingLaneFee.update({
            where: { id: row.id },
            // The columns too: a row that named its origin the old way is
            // rewritten the canonical way, so it stops being a duplicate
            // waiting to happen.
            data: { ...columns, baseFee, perUnitFee, largeRatePerCbm, largeMinFee },
          })
        : prisma.shippingLaneFee.create({
            data: { ...columns, baseFee, perUnitFee, largeRatePerCbm, largeMinFee },
          }),
    );
  }

  if (writes.length === 0) return { ok: true, message: "Nothing had changed." };

  try {
    await prisma.$transaction(writes);
  } catch {
    return { error: "Couldn't save the grid. Nothing was changed." };
  }

  revalidateShipping();
  const parts = [
    changed > 0 ? `${changed} journey${changed === 1 ? "" : "s"} priced` : "",
    cleared > 0 ? `${cleared} left to the default` : "",
  ].filter(Boolean);
  return { ok: true, message: `${parts.join(", ")}.` };
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

/**
 * One exchange rate, saved.
 *
 * This is the single most load-bearing number in the international system: a
 * forwarder quotes $260 per cubic metre and the buyer pays cedis, so every
 * imported fee on the platform moves when this does. That is the point — one
 * correction here re-prices thousands of listings, where storing converted
 * figures would mean re-typing every rate on the day the cedi moved.
 */
export async function saveCurrency(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const code = str(fd, "code").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (code.length !== 3) {
    return { error: "A currency code is three letters — USD, GHS, CNY.", fieldErrors: { code: "Three letters." } };
  }
  const rateToGhs = num(fd, "rateToGhs");
  // A rate of zero would quote every lane on this currency at nothing, which
  // reads on a buyer's screen as free shipping rather than as a mistake.
  if (rateToGhs <= 0) {
    return {
      error: "The rate must be above zero — what one unit of this currency is worth in cedis.",
      fieldErrors: { rateToGhs: "Must be above zero." },
    };
  }

  const data = {
    name: str(fd, "name").slice(0, 60),
    symbol: str(fd, "symbol").slice(0, 8),
    rateToGhs,
    isActive: !fd.has("isActive") || on(fd, "isActive"),
    // A rate somebody typed is a rate somebody meant. The nightly refresh
    // would otherwise overwrite it that same night, which reads as the form
    // not having saved.
    autoUpdate: on(fd, "autoUpdate"),
    source: on(fd, "autoUpdate") ? "" : "manual",
  };

  try {
    await prisma.currency.upsert({ where: { code }, update: data, create: { code, ...data } });
  } catch {
    return { error: "Couldn't save that currency." };
  }

  revalidateShipping();
  return { ok: true };
}

/**
 * Pull today's rates now, rather than waiting for the nightly refresh.
 *
 * The button exists because the cedi moves on a schedule of its own. A
 * currency pinned by hand is left alone, and a failure changes nothing — the
 * rates that were there stay there, and the screen says the fetch failed rather
 * than quietly showing yesterday's figures as though they were today's.
 *
 * Takes nothing: `useActionState` calls it with the previous state and the form
 * data, and there is no question to ask — the answer is always "every currency
 * that has not been pinned".
 */
export async function refreshRatesNow(): Promise<ShippingState> {
  await requireAdmin();
  const result = await refreshCurrencyRates();
  revalidateShipping();

  if (!result.ok) return { error: `Couldn't reach the rates service — ${result.error}.` };
  if (result.updated.length === 0) {
    return { ok: true, message: "Rates checked — nothing has moved." };
  }
  return { ok: true, message: `Updated ${result.updated.join(", ")}.` };
}

/**
 * Whether a currency's rate is fetched or held by hand.
 *
 * Pinning is for a rate somebody has a reason to hold: a contracted rate, or a
 * currency the provider quotes badly. The refresh then never touches it.
 */
export async function toggleCurrencyAuto(fd: FormData): Promise<void> {
  await requireAdmin();
  const code = str(fd, "code").toUpperCase();
  if (!code) return;
  const row = await prisma.currency.findUnique({ where: { code }, select: { autoUpdate: true } });
  if (!row) return;
  await prisma.currency.update({
    where: { code },
    data: { autoUpdate: !row.autoUpdate, ...(row.autoUpdate ? { source: "manual" } : {}) },
  });
  revalidateShipping();
}

/** Remove a currency. Lanes quoting in it fall back to converting one-for-one. */
export async function deleteCurrency(fd: FormData): Promise<void> {
  await requireAdmin();
  const code = str(fd, "code").toUpperCase();
  if (!code || code === "GHS") return;
  await prisma.currency.delete({ where: { code } }).catch(() => {});
  revalidateShipping();
}
