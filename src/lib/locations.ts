import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { locations as STATIC_LOCATIONS } from "@/lib/mock-data";
import type { Location, LocationType } from "@/lib/types";

/**
 * All locations for the storefront (the "Any Location" option plus active
 * places). Reads from the DB, falling back to the built-in list when the table
 * is empty or not migrated yet.
 */
export const getLocations = cache(async (): Promise<Location[]> => {
  try {
    const rows = await prisma.location.findMany({
      where: { OR: [{ isActive: true }, { id: "any" }] },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as LocationType,
        region: r.region,
        isActive: r.isActive,
      }));
    }
  } catch {
    // table not migrated yet
  }
  return STATIC_LOCATIONS;
});

/** All locations including inactive ones (for the admin). */
export async function getAllLocations(): Promise<(Location & { order: number })[]> {
  try {
    const rows = await prisma.location.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as LocationType,
      region: r.region,
      isActive: r.isActive,
      order: r.order,
    }));
  } catch {
    return STATIC_LOCATIONS.map((l, i) => ({ ...l, order: i }));
  }
}
