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
    flatFee: num(fd, "flatFee"),
    baseFee: num(fd, "baseFee"),
    perKgRate: num(fd, "perKgRate"),
    note: str(fd, "note"),
    isActive: !fd.has("isActive") || on(fd, "isActive"),
  };

  // A rule that charges nothing by any measure is not a price; it is a route
  // quoted free, which an admin should say with a flat fee of zero on purpose
  // rather than by leaving three boxes empty.
  if (values.flatFee === 0 && values.baseFee === 0 && values.perKgRate === 0 && !fd.has("allowZero")) {
    return {
      error:
        "Set a flat fee, or a base fee and a per-kg rate. To make a route genuinely free, tick “Free route”.",
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
