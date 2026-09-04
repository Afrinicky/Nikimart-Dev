"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { refreshCurrencyRates } from "@/lib/fx";
import type { CrudState } from "@/lib/admin-actions";

/**
 * Everything an admin can change about shipping *inside Ghana*, in one module.
 *
 * The forwarders are not here. A forwarder is a company with a rate sheet, and
 * their whole profile — warehouses, classes, lanes and prices — is saved as one
 * thing by `lib/forwarder-actions`. What is left in this module is the part of
 * the system NikiMart owns: our own consolidation points, the rules that price
 * the run from any point to a pickup station, the platform defaults, and the
 * exchange rates the forwarders' quotes are converted at.
 *
 * All of it is admin-only, and deliberately so. Sellers choose from these
 * lists; only admins write them.
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

function optId(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
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
  "abroadPageTitle",
  "abroadPageIntro",
] as const;

const AMOUNT_KEYS: Record<string, string> = {
  shipBaseFee: "Base fee",
  shipPerUnitFee: "Additional-unit fee",
  shipPerKgRate: "Per-kg rate",
  shipVolumetricDivisor: "Volumetric divisor",
  shipMinFee: "Minimum fee",
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

  for (const key of DEFAULT_KEYS) {
    if (!fd.has(key)) continue;
    const value = str(fd, key);
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  revalidateShipping();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Our own consolidation points
// ---------------------------------------------------------------------------

/**
 * A NikiMart consolidation point.
 *
 * Only ours. A forwarder's warehouse in Ghana belongs to that forwarder and is
 * created on their registration page, which is why there is no "kind" to choose
 * here and no duty to set: nothing clears customs at one of our points.
 */
function pointData(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    city: str(fd, "city"),
    address: str(fd, "address"),
    note: str(fd, "note"),
    kind: "local",
    isActive: on(fd, "isActive"),
    // The pickup station this point sits at. Setting it is what makes
    // collection there free, which is the single most useful thing on the form.
    hubPickupId: optId(fd, "hubPickupId"),
  };
}

export async function createConsolidationPoint(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = pointData(fd);
  if (data.name.length < 2 || data.code.length < 2) {
    return { error: "Name and code are required." };
  }
  const clash = await prisma.arrivalPoint.findUnique({ where: { code: data.code } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  try {
    await prisma.arrivalPoint.create({ data });
  } catch {
    return { error: "Couldn't create the point — its code may already be in use." };
  }
  revalidateShipping();
  redirect("/admin/shipping/points");
}

export async function updateConsolidationPoint(
  id: string,
  _prev: CrudState,
  fd: FormData,
): Promise<CrudState> {
  await requireAdmin();
  const data = pointData(fd);
  if (data.name.length < 2 || data.code.length < 2) {
    return { error: "Name and code are required." };
  }
  const clash = await prisma.arrivalPoint.findFirst({ where: { code: data.code, NOT: { id } } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  try {
    // Scoped to our own points: a forwarder's warehouse is not editable here.
    await prisma.arrivalPoint.updateMany({ where: { id, forwarderId: null }, data });
  } catch {
    return { error: "Couldn't save the point — its code may already be in use." };
  }
  revalidateShipping();
  redirect("/admin/shipping/points");
}

/**
 * Delete one of our consolidation points.
 *
 * Listings, order lines and shops that referred to it are left pointing at
 * nothing rather than at a point that no longer exists; the listing form then
 * asks the seller to choose again. That is the honest outcome, and it is what
 * an admin who presses delete is asking for.
 */
export async function deleteConsolidationPoint(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.arrivalPoint.deleteMany({ where: { id, forwarderId: null } }).catch(() => {});
  revalidateShipping();
}

// ---------------------------------------------------------------------------
// Domestic shipping rules
// ---------------------------------------------------------------------------

/**
 * Write one rule: a scope, and what it costs.
 *
 * The origin may be one of our points or a forwarder's Ghana warehouse, and
 * that second case is the whole run from a landed consignment to the station a
 * buyer collects at — Sunyani to Hwidiem, priced here.
 *
 * Upsert on the scope rather than create, because an admin correcting a price
 * means to replace it, not to stack a second rule the resolver would then be
 * choosing between arbitrarily. The scope's uniqueness cannot be expressed as a
 * Prisma `@@unique` — NULL never equals NULL — so the match is made here and
 * the database backs it with a COALESCE index (db/migrations/0006).
 */
export async function saveShippingRule(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();

  const scope = {
    originPointId: optId(fd, "originPointId"),
    destPickupId: optId(fd, "destPickupId"),
    categoryId: optId(fd, "categoryId"),
  };
  const values = {
    baseFee: num(fd, "baseFee"),
    perUnitFee: num(fd, "perUnitFee"),
    // The legacy columns are cleared on every save. A rule edited on this
    // screen is a rule expressed in the current model, and leaving an old flat
    // fee behind it would have the engine read a price nobody can see.
    flatFee: 0,
    perKgRate: 0,
    note: str(fd, "note"),
    isActive: !fd.has("isActive") || on(fd, "isActive"),
  };

  // A rule that charges nothing by any measure is not a price; it is a route
  // quoted free, which an admin should say on purpose rather than by leaving
  // two boxes empty.
  if (values.baseFee === 0 && values.perUnitFee === 0 && !fd.has("allowZero")) {
    return {
      error:
        "Set a base fee, and an amount for each additional item. To make a route genuinely free, tick “Free route”.",
    };
  }

  try {
    const existing = await prisma.shippingRule.findFirst({ where: scope, select: { id: true } });
    if (existing) {
      await prisma.shippingRule.update({ where: { id: existing.id }, data: values });
    } else {
      await prisma.shippingRule.create({ data: { ...scope, ...values } });
    }
  } catch {
    return { error: "Couldn't save that rule." };
  }

  revalidateShipping();
  return { ok: true };
}

export async function deleteShippingRule(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.shippingRule.delete({ where: { id } }).catch(() => {});
  revalidateShipping();
}

export async function toggleShippingRule(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const rule = await prisma.shippingRule.findUnique({ where: { id }, select: { isActive: true } });
  if (!rule) return;
  await prisma.shippingRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  revalidateShipping();
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
