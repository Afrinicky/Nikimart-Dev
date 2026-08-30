"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { FREIGHT_MODES } from "@/lib/abroad";
import { ANY } from "@/lib/arrival-points";
import type { CrudState } from "@/lib/admin-actions";

/**
 * Admin CRUD for Ghana arrival points and their international freight rates.
 *
 * These are the second leg's destinations — Tema Port, KIA cargo, a
 * consolidator's warehouse — and they are admin-owned rather than seller-owned
 * for the same reason shipping routes are: a seller who could invent a point
 * and its duty rate could quote a landed cost the platform then has to honour
 * at a customs desk. Sellers choose from this list; only admins write it.
 */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pointData(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    city: str(fd, "city"),
    address: str(fd, "address"),
    note: str(fd, "note"),
    dutyPercent: Math.min(num(fd, "dutyPercent"), 100),
    clearingFee: num(fd, "clearingFee"),
    isActive: fd.get("isActive") === "on",
    hubPickupId: str(fd, "hubPickupId") || null,
  };
}

function revalidateArrivalPoints() {
  revalidatePath("/admin/arrival-points");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/checkout");
}

export async function createArrivalPoint(_prev: CrudState, fd: FormData): Promise<CrudState> {
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
    return { error: "Couldn't create the arrival point — its code may already be in use." };
  }
  revalidateArrivalPoints();
  redirect("/admin/arrival-points");
}

export async function updateArrivalPoint(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
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
    return { error: "Couldn't save the arrival point — its code may already be in use." };
  }
  revalidateArrivalPoints();
  redirect("/admin/arrival-points");
}

/**
 * Retire a point rather than delete it when anything still refers to it.
 *
 * A listing or a past order pointed at a deleted point would lose the record of
 * where its goods cleared, and the order's snapshot would no longer join to
 * anything. Deactivating takes it off the seller's picker and leaves history
 * intact, which is the same trade the pickup points make.
 */
export async function deleteArrivalPoint(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;

  const [products, items] = await Promise.all([
    prisma.product.count({ where: { arrivalPointId: id } }),
    prisma.orderItem.count({ where: { arrivalPointId: id } }),
  ]);

  if (products > 0 || items > 0) {
    await prisma.arrivalPoint.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.arrivalPoint.delete({ where: { id } }).catch(() => {});
  }
  revalidateArrivalPoints();
}

/**
 * Write one rate row: what an origin costs by one mode into this point.
 *
 * Upsert rather than create, keyed on the point + origin + mode, because an
 * admin correcting last month's China sea rate means to replace it, not to
 * stack a second row the resolver would then have to choose between.
 */
export async function saveArrivalRate(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const arrivalPointId = str(fd, "arrivalPointId");
  if (!arrivalPointId) return { error: "Missing arrival point." };

  const originCountry = (str(fd, "originCountry") || ANY).toUpperCase();
  const mode = str(fd, "mode") || ANY;
  if (mode !== ANY && !(FREIGHT_MODES as string[]).includes(mode)) {
    return { error: "Unknown freight mode." };
  }

  const values = {
    ratePerCbm: num(fd, "ratePerCbm"),
    ratePerKg: num(fd, "ratePerKg"),
    minCharge: num(fd, "minCharge"),
    transitDays: Math.round(num(fd, "transitDays", 21)),
  };

  // A row that charges nothing by any measure is not a rate; it is a route
  // quoted free, which is never what an admin means to publish.
  if (values.ratePerCbm === 0 && values.ratePerKg === 0 && values.minCharge === 0) {
    return { error: "Set at least one of: rate per CBM, rate per kg, or a minimum charge." };
  }

  try {
    await prisma.arrivalRate.upsert({
      where: { arrivalPointId_originCountry_mode: { arrivalPointId, originCountry, mode } },
      create: { arrivalPointId, originCountry, mode, ...values },
      update: values,
    });
  } catch {
    return { error: "Couldn't save that rate." };
  }
  revalidateArrivalPoints();
  return {};
}

export async function deleteArrivalRate(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.arrivalRate.delete({ where: { id } }).catch(() => {});
  revalidateArrivalPoints();
}
