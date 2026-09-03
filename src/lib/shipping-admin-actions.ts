"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { FREIGHT_MODES } from "@/lib/abroad";
import { isPointKind } from "@/lib/shipping";
import type { CrudState } from "@/lib/admin-actions";

/**
 * Everything an admin can change about shipping, in one module.
 *
 * It used to take three: a rate-matrix action, an arrival-point CRUD, and half
 * of the settings action. They wrote to the same bill from three screens, so
 * nobody could see the whole configuration at once and a rate set in one place
 * silently contradicted a rate set in another. One console, one module.
 *
 * All of it is admin-only, and deliberately so. A seller who could invent a
 * consolidation point and its duty rate could quote a landed cost the platform
 * then has to honour at a customs desk. Sellers choose from these lists; only
 * admins write them.
 */

export type ShippingState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

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
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/pickup-points");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/products", "layout");
}

// ---------------------------------------------------------------------------
// Platform defaults
// ---------------------------------------------------------------------------

/** The setting keys this console owns. Nothing else writes them. */
const DEFAULT_KEYS = [
  "shipBaseFee",
  "shipPerUnitFee",
  "shipPerKgRate",
  "shipVolumetricDivisor",
  "shipMinFee",
  "shipDefaultPointId",
  "shipFallbackRatePerCbm",
  "ghanaImportTaxRate",
  "defaultImportDutyPercent",
  "shipPayOnPickupEnabled",
  "abroadPageTitle",
  "abroadPageIntro",
  "leadDaysCN",
  "leadDaysAE",
  "leadDaysUS",
  "leadDaysEU",
] as const;

const PERCENT_KEYS: Record<string, string> = {
  ghanaImportTaxRate: "Ghana VAT & levies",
  defaultImportDutyPercent: "Import duty",
};

const AMOUNT_KEYS: Record<string, string> = {
  shipBaseFee: "Base fee",
  shipPerUnitFee: "Additional-unit fee",
  shipPerKgRate: "Per-kg rate",
  shipVolumetricDivisor: "Volumetric divisor",
  shipMinFee: "Minimum fee",
  shipFallbackRatePerCbm: "Fallback rate per CBM",
};

/**
 * Save the platform defaults.
 *
 * Only keys the form actually submitted are written. The console is several
 * screens and each posts its own section; writing every key would let the
 * defaults screen blank the tax rates set on the abroad screen.
 */
export async function saveShippingDefaults(
  _prev: ShippingState,
  fd: FormData,
): Promise<ShippingState> {
  await requireAdmin();

  for (const [key, label] of Object.entries(PERCENT_KEYS)) {
    const v = str(fd, key);
    if (v && !(Number(v) >= 0 && Number(v) <= 100)) {
      return { error: `${label} must be between 0 and 100.`, fieldErrors: { [key]: "0–100 only." } };
    }
  }
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
// Consolidation points
// ---------------------------------------------------------------------------

function pointData(fd: FormData) {
  const kind = str(fd, "kind");
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    city: str(fd, "city"),
    address: str(fd, "address"),
    note: str(fd, "note"),
    kind: isPointKind(kind) ? kind : "local",
    dutyPercent: Math.min(num(fd, "dutyPercent"), 100),
    clearingFee: num(fd, "clearingFee"),
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
    await prisma.arrivalPoint.update({ where: { id }, data });
  } catch {
    return { error: "Couldn't save the point — its code may already be in use." };
  }
  revalidateShipping();
  redirect("/admin/shipping/points");
}

/**
 * Retire a point rather than delete it when anything still refers to it.
 *
 * A listing or a past order pointed at a deleted point would lose the record of
 * where its goods gathered, and the order's snapshot would no longer join to
 * anything. Deactivating takes it off the seller's picker and leaves history
 * intact, which is the same trade the pickup points make.
 */
export async function deleteConsolidationPoint(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;

  const [products, items, vendors] = await Promise.all([
    prisma.product.count({ where: { arrivalPointId: id } }),
    prisma.orderItem.count({ where: { arrivalPointId: id } }),
    prisma.vendor.count({ where: { consolidationPointId: id } }),
  ]);

  if (products > 0 || items > 0 || vendors > 0) {
    await prisma.arrivalPoint.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.arrivalPoint.delete({ where: { id } }).catch(() => {});
  }
  revalidateShipping();
}

// ---------------------------------------------------------------------------
// Domestic shipping rules
// ---------------------------------------------------------------------------

/**
 * Write one rule: a scope, and what it costs.
 *
 * Upsert on the scope rather than create, because an admin correcting the
 * Kumasi→Accra blender price means to replace it, not to stack a second rule
 * the resolver would then be choosing between arbitrarily. The scope's
 * uniqueness cannot be expressed as a Prisma `@@unique` — NULL never equals
 * NULL — so the match is made here and the database backs it with a COALESCE
 * index (db/migrations/0006).
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
// Freight forwarders
// ---------------------------------------------------------------------------

function forwarderData(fd: FormData) {
  const mode = str(fd, "mode");
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    originCountry: str(fd, "originCountry").toUpperCase().slice(0, 2),
    mode: (FREIGHT_MODES as string[]).includes(mode) ? mode : "sea",
    consolidationPointId: optId(fd, "consolidationPointId"),
    // The currency their whole price list is quoted in. Routes may override it.
    currency: (str(fd, "currency") || "GHS").toUpperCase().slice(0, 3),
    terms: str(fd, "terms").slice(0, 4000),
    // Ghana-bound consolidators almost always quote a rate that already
    // contains the port fees, the duty and the taxes. Defaulting this off would
    // put duty on top of a rate that already had it in, and double-bill.
    allInclusive: !fd.has("allInclusive") || on(fd, "allInclusive"),
    note: str(fd, "note"),
    isActive: on(fd, "isActive"),
  };
}

export async function createForwarder(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = forwarderData(fd);
  if (data.name.length < 2 || data.code.length < 2) {
    return { error: "Name and code are required." };
  }
  const clash = await prisma.freightForwarder.findUnique({ where: { code: data.code } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  let created;
  try {
    created = await prisma.freightForwarder.create({ data });
  } catch {
    return { error: "Couldn't create the forwarder — its code may already be in use." };
  }
  revalidateShipping();
  // Straight to their price list: a forwarder with no prices cannot carry
  // anything, so leaving the admin on the index would only invite them back.
  redirect(`/admin/shipping/abroad/${created.id}`);
}

export async function updateForwarder(
  id: string,
  _prev: CrudState,
  fd: FormData,
): Promise<CrudState> {
  await requireAdmin();
  const data = forwarderData(fd);
  if (data.name.length < 2 || data.code.length < 2) {
    return { error: "Name and code are required." };
  }
  const clash = await prisma.freightForwarder.findFirst({ where: { code: data.code, NOT: { id } } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  try {
    await prisma.freightForwarder.update({ where: { id }, data });
  } catch {
    return { error: "Couldn't save the forwarder — its code may already be in use." };
  }
  revalidateShipping();
  return {};
}

/** Retire a forwarder that listings still use; delete one nothing points at. */
export async function deleteForwarder(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;

  const products = await prisma.product.count({ where: { forwarderId: id } });
  if (products > 0) {
    await prisma.freightForwarder.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.freightForwarder.delete({ where: { id } }).catch(() => {});
  }
  revalidateShipping();
}

/**
 * One price on a forwarder's list.
 *
 * Keyed on the category, because a forwarder charging one rate per cubic metre
 * for clothing and another for electronics is ordinary. The row with no
 * category is their catch-all, and it is the one worth setting first: a
 * forwarder with only category rows cannot carry anything else.
 */
export async function saveForwarderRate(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const forwarderId = str(fd, "forwarderId");
  if (!forwarderId) return { error: "Missing forwarder." };

  const categoryId = optId(fd, "categoryId");
  const values = {
    label: str(fd, "label"),
    ratePerCbm: num(fd, "ratePerCbm"),
    ratePerKg: num(fd, "ratePerKg"),
    minCharge: num(fd, "minCharge"),
    transitDays: Math.round(num(fd, "transitDays", 21)),
  };

  if (values.ratePerCbm === 0 && values.ratePerKg === 0 && values.minCharge === 0) {
    return { error: "Set at least one of: rate per CBM, rate per kg, or a minimum charge." };
  }

  try {
    const existing = await prisma.forwarderRate.findFirst({
      where: { forwarderId, categoryId },
      select: { id: true },
    });
    if (existing) {
      await prisma.forwarderRate.update({ where: { id: existing.id }, data: values });
    } else {
      await prisma.forwarderRate.create({ data: { forwarderId, categoryId, ...values } });
    }
  } catch {
    return { error: "Couldn't save that price." };
  }

  revalidateShipping();
  return { ok: true };
}

export async function deleteForwarderRate(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.forwarderRate.delete({ where: { id } }).catch(() => {});
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
  // A rate of zero would quote every route on this currency at nothing, which
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
  };

  try {
    await prisma.currency.upsert({ where: { code }, update: data, create: { code, ...data } });
  } catch {
    return { error: "Couldn't save that currency." };
  }

  revalidateShipping();
  return { ok: true };
}

/** Remove a currency. Routes quoting in it fall back to converting one-for-one. */
export async function deleteCurrency(fd: FormData): Promise<void> {
  await requireAdmin();
  const code = str(fd, "code").toUpperCase();
  if (!code || code === "GHS") return;
  await prisma.currency.delete({ where: { code } }).catch(() => {});
  revalidateShipping();
}

// ---------------------------------------------------------------------------
// A forwarder's goods classes, and our categories mapped onto them
// ---------------------------------------------------------------------------

/**
 * One of the forwarder's own classes: Normal Goods, Special Goods, Heavy-Duty.
 *
 * Deliberately not our categories. A forwarder prices a container by what is in
 * it — how dense, how awkward, how regulated — and no amount of renaming our
 * storefront categories will make "Fashion" a thing a shipping line quotes.
 * The surcharge is the levy that rides on the class whatever the route: the
 * energy commission on appliances, the FDA charge on diapers and wigs.
 */
export async function saveGoodsClass(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const forwarderId = str(fd, "forwarderId");
  const id = str(fd, "id");
  const name = str(fd, "name").slice(0, 80);
  if (!forwarderId) return { error: "Missing forwarder." };
  if (name.length < 2) return { error: "Give the class a name — “Normal Goods”, “Heavy-Duty”." };

  const data = {
    name,
    note: str(fd, "note").slice(0, 500),
    surchargePerCbm: num(fd, "surchargePerCbm"),
    surchargeLabel: str(fd, "surchargeLabel").slice(0, 80),
    sortOrder: Math.round(num(fd, "sortOrder")),
    isDefault: on(fd, "isDefault"),
  };

  try {
    const saved = id
      ? await prisma.forwarderGoodsClass.update({ where: { id }, data })
      : await prisma.forwarderGoodsClass.create({ data: { forwarderId, ...data } });

    // Exactly one default, or the "everything else" class is whichever row the
    // database happened to return first.
    if (data.isDefault) {
      await prisma.forwarderGoodsClass.updateMany({
        where: { forwarderId, NOT: { id: saved.id } },
        data: { isDefault: false },
      });
    }
  } catch {
    return { error: "Couldn't save that class — the name may already be in use." };
  }

  revalidateShipping();
  return { ok: true };
}

/** Remove a class. Its rates and mappings go with it. */
export async function deleteGoodsClass(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.forwarderGoodsClass.delete({ where: { id } }).catch(() => {});
  revalidateShipping();
}

/**
 * Map our categories onto the forwarder's classes, all at once.
 *
 * One submit for the whole table rather than a save button per row: an admin
 * setting a forwarder up is answering one question — "which of your classes
 * does each of our categories belong in?" — and asking them to press save
 * fourteen times turns that into a chore they abandon halfway through, leaving
 * half the catalogue on the default class without knowing it.
 *
 * A blank choice means "no opinion", and the class marked default takes it.
 */
export async function saveCategoryMap(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const forwarderId = str(fd, "forwarderId");
  if (!forwarderId) return { error: "Missing forwarder." };

  const classes = await prisma.forwarderGoodsClass.findMany({
    where: { forwarderId },
    select: { id: true },
  });
  const known = new Set(classes.map((c) => c.id));

  const wanted = new Map<string, string>();
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("map:")) continue;
    const categoryId = key.slice(4);
    const goodsClassId = String(value ?? "").trim();
    // A class id that is not this forwarder's is a claim from a browser.
    if (goodsClassId && known.has(goodsClassId)) wanted.set(categoryId, goodsClassId);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.forwarderCategoryMap.deleteMany({ where: { forwarderId } });
      if (wanted.size > 0) {
        await tx.forwarderCategoryMap.createMany({
          data: [...wanted].map(([categoryId, goodsClassId]) => ({
            forwarderId,
            categoryId,
            goodsClassId,
          })),
        });
      }
    });
  } catch {
    return { error: "Couldn't save the category mapping." };
  }

  revalidateShipping();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Routes, and their prices
// ---------------------------------------------------------------------------

function routeData(fd: FormData) {
  const mode = str(fd, "mode");
  const minDays = Math.round(num(fd, "minDays", 21));
  const maxDays = Math.round(num(fd, "maxDays", 45));
  return {
    name: str(fd, "name").slice(0, 120),
    originCountry: str(fd, "originCountry").toUpperCase().slice(0, 2),
    originCity: str(fd, "originCity").slice(0, 80),
    mode: (FREIGHT_MODES as string[]).includes(mode) ? mode : "sea",
    destinationPointId: optId(fd, "destinationPointId"),
    currency: (str(fd, "currency") || "GHS").toUpperCase().slice(0, 3),
    minDays,
    // A window that runs backwards would be shown to a buyer as "45–35 days".
    maxDays: Math.max(minDays, maxDays),
    note: str(fd, "note").slice(0, 500),
    isActive: !fd.has("isActive") || on(fd, "isActive"),
    isDefault: on(fd, "isDefault"),
  };
}

/**
 * One lane a forwarder sells, saved.
 *
 * This is the unit a buyer chooses between at checkout — "sea, 35–45 days" or
 * "air, 7–14" — so everything that differs between those two answers lives on
 * the route: the mode, the Ghana depot it lands at, the currency and the
 * window. The prices hang off it, one per goods class.
 */
export async function saveRoute(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const forwarderId = str(fd, "forwarderId");
  const id = str(fd, "id");
  if (!forwarderId) return { error: "Missing forwarder." };

  const data = routeData(fd);
  if (!data.name && !data.originCountry && !data.destinationPointId) {
    return { error: "Say at least where this route collects from, or where it lands." };
  }

  try {
    const saved = id
      ? await prisma.forwarderRoute.update({ where: { id }, data })
      : await prisma.forwarderRoute.create({ data: { forwarderId, ...data } });

    // One default route per forwarder: it is what a listing is quoted on before
    // the buyer has chosen, and two of them would make that quote arbitrary.
    if (data.isDefault) {
      await prisma.forwarderRoute.updateMany({
        where: { forwarderId, NOT: { id: saved.id } },
        data: { isDefault: false },
      });
    }
  } catch {
    return { error: "Couldn't save that route." };
  }

  revalidateShipping();
  return { ok: true };
}

export async function deleteRoute(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  // An order line may point at this route as the record of what its buyer was
  // promised; the foreign key nulls that rather than losing the order.
  await prisma.forwarderRoute.delete({ where: { id } }).catch(() => {});
  revalidateShipping();
}

export async function toggleRoute(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const route = await prisma.forwarderRoute.findUnique({ where: { id }, select: { isActive: true } });
  if (!route) return;
  await prisma.forwarderRoute.update({ where: { id }, data: { isActive: !route.isActive } });
  revalidateShipping();
}

/**
 * One price on one route, for one of the forwarder's classes.
 *
 * Upserted on (route, class) rather than created, because an admin correcting
 * the heavy-duty rate on the Kumasi lane means to replace it, not to stack a
 * second price the resolver would then be choosing between arbitrarily.
 *
 * `minCbm` is how a quote sheet says "Normal Goods <1 CBM — $260": anything
 * smaller is still billed as one. Without it half a cubic metre would be quoted
 * at $130 and invoiced at $260.
 */
export async function saveRouteRate(_prev: ShippingState, fd: FormData): Promise<ShippingState> {
  await requireAdmin();
  const routeId = str(fd, "routeId");
  if (!routeId) return { error: "Missing route." };
  const goodsClassId = optId(fd, "goodsClassId");

  const values = {
    ratePerCbm: num(fd, "ratePerCbm"),
    ratePerKg: num(fd, "ratePerKg"),
    minCharge: num(fd, "minCharge"),
    minCbm: num(fd, "minCbm"),
    note: str(fd, "note").slice(0, 300),
  };

  if (values.ratePerCbm === 0 && values.ratePerKg === 0 && values.minCharge === 0) {
    return { error: "Set at least one of: per CBM, per kg, or a minimum charge." };
  }

  try {
    const existing = await prisma.forwarderRouteRate.findFirst({
      where: { routeId, goodsClassId },
      select: { id: true },
    });
    if (existing) {
      await prisma.forwarderRouteRate.update({ where: { id: existing.id }, data: values });
    } else {
      await prisma.forwarderRouteRate.create({ data: { routeId, goodsClassId, ...values } });
    }
  } catch {
    return { error: "Couldn't save that price." };
  }

  revalidateShipping();
  return { ok: true };
}

export async function deleteRouteRate(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.forwarderRouteRate.delete({ where: { id } }).catch(() => {});
  revalidateShipping();
}
