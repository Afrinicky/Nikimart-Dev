"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseLocationKey } from "@/lib/shipping";
import type { CrudState } from "@/lib/admin-actions";

/**
 * Locations: one screen for every place goods pass through.
 *
 * There used to be two. Pickup points were created under Admin → Pickup, and
 * consolidation points under Admin → Shipping, and nothing tied them together —
 * so the same building was typed in twice, under two names, and the two lists
 * disagreed. An admin looking at "NikiMart Pickup — Sunyani" on one screen and
 * "Sunyani Point" on the other had no way to know they were the same shelf.
 *
 * They are now one thing with two roles. A location is somewhere buyers
 * collect, or somewhere goods gather, or — usually — both, and ticking both
 * boxes writes both rows and links them, which is what makes collecting where
 * the goods already sit free without anybody configuring a zero.
 *
 * The two tables survive underneath because every order, shipment, listing and
 * saved preference already points at one of them. Merging the storage is a
 * migration of live order history; merging the concept is this file.
 */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function on(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

/** Everything a location change can move. */
function revalidateLocations() {
  revalidatePath("/admin/shipping", "layout");
  revalidatePath("/admin/pickup-points");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/pickup-points");
  revalidatePath("/products", "layout");
}

interface LocationInput {
  name: string;
  code: string;
  where: string;
  address: string;
  openingHours: string;
  note: string;
  operatorId: string | null;
  isPickup: boolean;
  isConsolidation: boolean;
  isActive: boolean;
}

function locationData(fd: FormData): LocationInput {
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    where: str(fd, "where"),
    address: str(fd, "address"),
    openingHours: str(fd, "openingHours"),
    note: str(fd, "note"),
    operatorId: str(fd, "operatorId") || null,
    isPickup: on(fd, "isPickup"),
    isConsolidation: on(fd, "isConsolidation"),
    isActive: on(fd, "isActive"),
  };
}

/** What both tables are told about a place, from the one form. */
function pickupFields(d: LocationInput) {
  return {
    name: d.name,
    code: d.code,
    locationName: d.where,
    address: d.address,
    openingHours: d.openingHours,
    isActive: d.isActive,
    operatorId: d.operatorId,
  };
}

function pointFields(d: LocationInput, hubPickupId: string | null) {
  return {
    name: d.name,
    code: d.code,
    city: d.where,
    address: d.address,
    note: d.note,
    kind: "local",
    isActive: d.isActive,
    hubPickupId,
  };
}

/**
 * The checks worth making before anything is written.
 *
 * A location that plays no role at all is the one an admin creates by accident:
 * it would appear on no screen, price no journey, and be collectable at
 * nowhere. Saying so beats saving it.
 */
async function validate(
  d: LocationInput,
  skip: { pickupId?: string | null; pointId?: string | null } = {},
): Promise<string | null> {
  if (d.name.length < 2 || d.code.length < 2) return "A name and a code are required.";
  if (!d.isPickup && !d.isConsolidation) {
    return "A location has to do something: let buyers collect here, gather goods here, or both.";
  }
  if (d.isPickup && d.address.length < 3) {
    return "A place buyers collect from needs an address.";
  }

  if (d.isPickup) {
    const clash = await prisma.pickupPoint.findFirst({
      where: { code: d.code, NOT: { id: skip.pickupId ?? "__none__" } },
      select: { name: true },
    });
    if (clash) return `The code ${d.code} is already used by “${clash.name}”.`;
    // An operator account runs one station: operatorId is unique.
    if (d.operatorId) {
      const taken = await prisma.pickupPoint.findFirst({
        where: { operatorId: d.operatorId, NOT: { id: skip.pickupId ?? "__none__" } },
        select: { name: true },
      });
      if (taken) return `That operator already runs “${taken.name}”.`;
    }
  }

  if (d.isConsolidation) {
    const clash = await prisma.arrivalPoint.findFirst({
      where: { code: d.code, NOT: { id: skip.pointId ?? "__none__" } },
      select: { name: true },
    });
    if (clash) return `The code ${d.code} is already used by the point “${clash.name}”.`;
  }

  return null;
}

export async function createShippingLocation(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const d = locationData(fd);
  const error = await validate(d);
  if (error) return { error };

  try {
    await prisma.$transaction(async (tx) => {
      const pickup = d.isPickup
        ? await tx.pickupPoint.create({ data: pickupFields(d), select: { id: true } })
        : null;
      if (d.isConsolidation) {
        await tx.arrivalPoint.create({ data: pointFields(d, pickup?.id ?? null) });
      }
    });
  } catch {
    return { error: "Couldn't create that location — its code or operator may already be in use." };
  }

  revalidateLocations();
  redirect("/admin/shipping/locations");
}

/**
 * Save a location, adding or removing its roles.
 *
 * Turning a role off deletes the row behind it, with one exception: a station
 * that has taken orders is deactivated instead, because an order has to keep
 * naming the place it is waiting at. Turning a role on creates the row and
 * links it, so an admin can decide months later that goods should gather at a
 * station they already run.
 */
export async function updateShippingLocation(
  key: string,
  _prev: CrudState,
  fd: FormData,
): Promise<CrudState> {
  await requireAdmin();
  const parsed = parseLocationKey(key);
  if (!parsed) return { error: "That location no longer exists." };

  // Find both halves of the place from whichever half the key names.
  const pickup =
    parsed.kind === "pickup"
      ? await prisma.pickupPoint.findUnique({ where: { id: parsed.id }, select: { id: true } })
      : null;
  const point =
    parsed.kind === "point"
      ? await prisma.arrivalPoint.findUnique({
          where: { id: parsed.id },
          select: { id: true, forwarderId: true },
        })
      : await prisma.arrivalPoint.findFirst({
          where: { hubPickupId: parsed.id },
          select: { id: true, forwarderId: true },
        });

  if (parsed.kind === "pickup" && !pickup) return { error: "That location no longer exists." };
  if (parsed.kind === "point" && !point) return { error: "That location no longer exists." };
  if (point?.forwarderId) {
    return {
      error: "That warehouse belongs to a freight forwarder. Edit it on their page instead.",
    };
  }

  const d = locationData(fd);
  const error = await validate(d, { pickupId: pickup?.id, pointId: point?.id });
  if (error) return { error };

  try {
    await prisma.$transaction(async (tx) => {
      let pickupId = pickup?.id ?? null;

      if (d.isPickup) {
        pickupId = pickupId
          ? (await tx.pickupPoint.update({ where: { id: pickupId }, data: pickupFields(d) })).id
          : (await tx.pickupPoint.create({ data: pickupFields(d), select: { id: true } })).id;
      } else if (pickupId) {
        const orders = await tx.order.count({ where: { pickupPointId: pickupId } });
        // An order names the station it is waiting at. Deactivating keeps that
        // record honest where deleting would orphan it.
        if (orders > 0) {
          await tx.pickupPoint.update({ where: { id: pickupId }, data: { isActive: false } });
        } else {
          await tx.pickupPoint.delete({ where: { id: pickupId } });
          pickupId = null;
        }
      }

      if (d.isConsolidation) {
        if (point) {
          await tx.arrivalPoint.update({ where: { id: point.id }, data: pointFields(d, pickupId) });
        } else {
          await tx.arrivalPoint.create({ data: pointFields(d, pickupId) });
        }
      } else if (point) {
        // Listings here are left pointing at nothing rather than at a point
        // that no longer gathers anything; the listing form asks again.
        await tx.arrivalPoint.delete({ where: { id: point.id } });
      }
    });
  } catch {
    return { error: "Couldn't save that location — its code or operator may already be in use." };
  }

  revalidateLocations();
  redirect("/admin/shipping/locations");
}

/**
 * Remove a location entirely.
 *
 * A station with orders against it is retired rather than deleted, for the same
 * reason as above. Everything else goes, and the grid cells that priced runs
 * out of it go with it — there is no journey left to price.
 */
export async function deleteShippingLocation(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = parseLocationKey(str(fd, "id"));
  if (!parsed) return;

  const pointWhere =
    parsed.kind === "point" ? { id: parsed.id } : { hubPickupId: parsed.id, forwarderId: null };

  await prisma
    .$transaction(async (tx) => {
      await tx.arrivalPoint.deleteMany({ where: { ...pointWhere, forwarderId: null } });

      if (parsed.kind !== "pickup") return;
      const orders = await tx.order.count({ where: { pickupPointId: parsed.id } });
      if (orders > 0) {
        await tx.pickupPoint.update({ where: { id: parsed.id }, data: { isActive: false } });
      } else {
        await tx.pickupPoint.delete({ where: { id: parsed.id } });
      }
    })
    .catch(() => {});

  revalidateLocations();
}
