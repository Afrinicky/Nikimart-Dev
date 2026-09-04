"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  DEFAULT_FORWARDER_CURRENCY,
  isFreightMode,
  ORDER_FREQUENCIES,
} from "@/lib/shipping";

/**
 * A freight forwarder, saved whole.
 *
 * Registering one used to be four screens in sequence — create the company,
 * then its classes, then its lanes, then a price per class per lane — and the
 * order mattered, because a price needs a class and a class needs a company.
 * Anybody who stopped halfway left a forwarder who could not quote.
 *
 * So the whole profile is one form and one transaction. The client posts
 * everything it knows: who they are, their Ghana warehouses, the classes of
 * goods down the side of their grid, the modes across the top, and a rate per
 * cubic metre in each cell. New rows and columns carry a client-side `key`
 * instead of an id; this module resolves those keys to real ids as it writes,
 * which is what lets a grid be filled in before anything exists.
 *
 * Anything the payload leaves out is deleted. That is the point of saving a
 * whole profile: what is on the screen is what the forwarder is.
 */

export type ForwarderState = { ok?: boolean; error?: string; id?: string };

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface GoodsClassInput {
  /** Stable client-side handle. Also the key the grid's cells are stored under. */
  key: string;
  id?: string;
  name: string;
  note?: string;
  /** The special levy: extra cubic metres added before the rate is applied. */
  levyCbm?: number;
  levyLabel?: string;
  isDefault?: boolean;
}

export interface RouteInput {
  key: string;
  id?: string;
  /** The column heading. Blank falls back to the mode's own name. */
  name?: string;
  mode: string;
  currency?: string;
  minDays?: number;
  maxDays?: number;
  /** The smallest consignment this lane accepts. */
  minCbm?: number;
  orderFrequency?: string;
  orderFrequencyDetail?: string;
  note?: string;
  isActive?: boolean;
  isDefault?: boolean;
  /**
   * The column of the grid: class key → rate per cubic metre. `null` is the
   * N/A cell — this lane does not carry that class.
   */
  rates: Record<string, number | null>;
}

export interface PointInput {
  key: string;
  id?: string;
  name: string;
  code: string;
  city?: string;
  address?: string;
  note?: string;
  /** The pickup station this warehouse sits at, when it is one. */
  hubPickupId?: string | null;
  isActive?: boolean;
  /** The lanes into this warehouse — the columns of its grid. */
  routes: RouteInput[];
}

export interface ForwarderInput {
  name: string;
  code: string;
  ghanaAddress?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  originCountry?: string;
  collectionAddress?: string;
  collectionCity?: string;
  currency?: string;
  note?: string;
  terms?: string;
  isActive?: boolean;
  classes: GoodsClassInput[];
  points: PointInput[];
  /** Our category id → a class key. Blank means "use their default class". */
  categoryMap: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

function text(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function nonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function whole(v: unknown): number {
  return Math.round(nonNegative(v));
}

function code(v: unknown): string {
  return text(v, 24).toUpperCase().replace(/\s+/g, "-");
}

function currency(v: unknown, fallback: string): string {
  const c = text(v, 3).toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 3 ? c : fallback;
}

function frequency(v: unknown): string {
  const f = text(v, 20).toLowerCase();
  return (ORDER_FREQUENCIES as string[]).includes(f) ? f : "";
}

/** Read the payload the form posts as one JSON field. */
function parsePayload(raw: string): ForwarderInput | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ForwarderInput;
  } catch {
    return null;
  }
}

function revalidateShipping() {
  revalidatePath("/admin/shipping", "layout");
  revalidatePath("/admin/purchasing", "layout");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/products", "layout");
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/**
 * Create or replace one forwarder's whole profile.
 *
 * `id` empty creates. Everything below the forwarder is reconciled by id:
 * rows the payload still names are updated, rows it does not are deleted. A
 * deleted warehouse takes its lanes and prices with it, and any listing that
 * pointed at it is left pointing at nothing rather than at a warehouse that no
 * longer exists — which is the honest outcome, and the one the listing form
 * then asks the seller to fix.
 */
export async function saveForwarder(
  id: string,
  _prev: ForwarderState,
  fd: FormData,
): Promise<ForwarderState> {
  await requireAdmin();

  const input = parsePayload(String(fd.get("payload") ?? ""));
  if (!input) return { error: "Couldn't read the form." };

  const name = text(input.name, 120);
  const forwarderCode = code(input.code);
  if (name.length < 2) return { error: "Give the forwarder a name." };
  if (forwarderCode.length < 2) return { error: "Give the forwarder a short code." };

  const classes = (input.classes ?? []).filter((c) => text(c.name, 80).length >= 2);
  const points = (input.points ?? []).filter(
    (p) => text(p.name, 120).length >= 2 && code(p.code).length >= 2,
  );

  if (classes.length === 0) {
    return { error: "Add at least one class of goods — the rows of the rate grid." };
  }
  if (points.length === 0) {
    return { error: "Add at least one consolidation point in Ghana." };
  }

  // Exactly one default class, or "everything else" is whichever row the
  // database happened to return first.
  const defaultKey = classes.find((c) => c.isDefault)?.key ?? classes[0].key;

  const clash = await prisma.freightForwarder.findFirst({
    where: { code: forwarderCode, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `The code ${forwarderCode} is already in use.` };

  const base = {
    name,
    code: forwarderCode,
    ghanaAddress: text(input.ghanaAddress, 300),
    contactName: text(input.contactName, 120),
    contactPhone: text(input.contactPhone, 40),
    contactEmail: text(input.contactEmail, 120),
    originCountry: text(input.originCountry, 2).toUpperCase(),
    collectionAddress: text(input.collectionAddress, 300),
    collectionCity: text(input.collectionCity, 120),
    currency: currency(input.currency, DEFAULT_FORWARDER_CURRENCY),
    note: text(input.note, 500),
    terms: text(input.terms, 4000),
    isActive: input.isActive !== false,
  };

  try {
    const savedId = await prisma.$transaction(
      async (tx) => {
        const forwarder = id
          ? await tx.freightForwarder.update({ where: { id }, data: base })
          : await tx.freightForwarder.create({ data: base });
        const fid = forwarder.id;

        // --- Classes: the rows ------------------------------------------------
        const classIdByKey = new Map<string, string>();
        const keptClassIds: string[] = [];
        let sortOrder = 0;
        for (const c of classes) {
          const data = {
            name: text(c.name, 80),
            note: text(c.note, 500),
            levyCbm: nonNegative(c.levyCbm),
            levyLabel: text(c.levyLabel, 80),
            sortOrder: sortOrder++,
            isDefault: c.key === defaultKey,
          };
          const existing = c.id
            ? await tx.forwarderGoodsClass.findFirst({
                where: { id: c.id, forwarderId: fid },
                select: { id: true },
              })
            : null;
          const saved = existing
            ? await tx.forwarderGoodsClass.update({ where: { id: existing.id }, data })
            : await tx.forwarderGoodsClass.create({ data: { forwarderId: fid, ...data } });
          classIdByKey.set(c.key, saved.id);
          keptClassIds.push(saved.id);
        }
        await tx.forwarderGoodsClass.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptClassIds } },
        });

        // --- Points, their lanes, and the grid --------------------------------
        const keptPointIds: string[] = [];
        const keptRouteIds: string[] = [];
        let defaultRouteTaken = false;

        for (const p of points) {
          const pointData = {
            name: text(p.name, 120),
            code: code(p.code),
            city: text(p.city, 120),
            address: text(p.address, 300),
            note: text(p.note, 500),
            kind: "international",
            hubPickupId: text(p.hubPickupId, 40) || null,
            isActive: p.isActive !== false,
          };
          const existingPoint = p.id
            ? await tx.arrivalPoint.findFirst({
                where: { id: p.id, forwarderId: fid },
                select: { id: true },
              })
            : null;
          const point = existingPoint
            ? await tx.arrivalPoint.update({ where: { id: existingPoint.id }, data: pointData })
            : await tx.arrivalPoint.create({ data: { forwarderId: fid, ...pointData } });
          keptPointIds.push(point.id);

          for (const r of p.routes ?? []) {
            if (!isFreightMode(r.mode)) continue;
            const minDays = whole(r.minDays);
            const isDefault = Boolean(r.isDefault) && !defaultRouteTaken;
            if (isDefault) defaultRouteTaken = true;

            const routeData = {
              name: text(r.name, 120),
              mode: r.mode,
              destinationPointId: point.id,
              currency: currency(r.currency, base.currency),
              minDays,
              // A window that runs backwards would read as "45–35 days".
              maxDays: Math.max(minDays, whole(r.maxDays)),
              minCbm: nonNegative(r.minCbm),
              orderFrequency: frequency(r.orderFrequency),
              orderFrequencyDetail: text(r.orderFrequencyDetail, 120),
              note: text(r.note, 500),
              isActive: r.isActive !== false,
              isDefault,
            };
            const existingRoute = r.id
              ? await tx.forwarderRoute.findFirst({
                  where: { id: r.id, forwarderId: fid },
                  select: { id: true },
                })
              : null;
            const route = existingRoute
              ? await tx.forwarderRoute.update({ where: { id: existingRoute.id }, data: routeData })
              : await tx.forwarderRoute.create({ data: { forwarderId: fid, ...routeData } });
            keptRouteIds.push(route.id);

            // The column of the grid. A null cell is stored as "not available"
            // rather than dropped, so the listing form can say why a combination
            // is refused instead of falling through to somebody else's price.
            await tx.forwarderRouteRate.deleteMany({ where: { routeId: route.id } });
            const cells = Object.entries(r.rates ?? {})
              .map(([classKey, value]) => {
                const goodsClassId = classIdByKey.get(classKey);
                if (!goodsClassId) return null;
                const available = value !== null && value !== undefined && nonNegative(value) > 0;
                return {
                  routeId: route.id,
                  goodsClassId,
                  ratePerCbm: available ? nonNegative(value) : 0,
                  isAvailable: available,
                  note: "",
                };
              })
              .filter((c): c is NonNullable<typeof c> => c !== null);
            if (cells.length > 0) await tx.forwarderRouteRate.createMany({ data: cells });
          }
        }

        await tx.forwarderRoute.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptRouteIds } },
        });
        await tx.arrivalPoint.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptPointIds } },
        });

        // If nothing was marked as the default lane, the first live one is it.
        if (!defaultRouteTaken && keptRouteIds.length > 0) {
          await tx.forwarderRoute.update({
            where: { id: keptRouteIds[0] },
            data: { isDefault: true },
          });
        }

        // --- Our categories, placed in their classes --------------------------
        await tx.forwarderCategoryMap.deleteMany({ where: { forwarderId: fid } });
        const mappings = Object.entries(input.categoryMap ?? {})
          .map(([categoryId, classKey]) => {
            const goodsClassId = classIdByKey.get(String(classKey));
            return goodsClassId ? { forwarderId: fid, categoryId, goodsClassId } : null;
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        if (mappings.length > 0) {
          await tx.forwarderCategoryMap.createMany({ data: mappings, skipDuplicates: true });
        }

        return fid;
      },
      // A wide grid is a lot of small writes in one go. The default five
      // seconds is enough for a two-column sheet and not for a real one.
      { maxWait: 10_000, timeout: 60_000 },
    );

    revalidateShipping();
    return { ok: true, id: savedId };
  } catch {
    return { error: "Couldn't save the forwarder — a code may already be in use." };
  }
}

/**
 * Delete a forwarder outright.
 *
 * Deactivating instead was the old behaviour and it was the wrong one: an admin
 * who deletes a forwarder means the company is gone, and leaving a hidden row
 * behind meant its code stayed taken and its warehouses stayed in the database.
 * Their classes, lanes, prices and Ghana warehouses go with them. Listings and
 * order lines that referred to any of it keep their own records and are left
 * pointing at nothing, which the listing form then asks the seller to fix.
 */
export async function deleteForwarder(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;
  await prisma.freightForwarder.delete({ where: { id } }).catch(() => {});
  revalidateShipping();
}
