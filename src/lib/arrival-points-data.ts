import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ANY, type ArrivalPointConfig } from "@/lib/arrival-points";
import { getAbroadConfig } from "@/lib/settings";

/**
 * Loading Ghana arrival points and their rate tables.
 *
 * Kept apart from the pure `arrival-points` module so the maths can run in the
 * browser (the seller's live landed-cost estimate) while the queries stay on
 * the server. Every loader degrades to an empty list rather than throwing: an
 * unreachable database should leave checkout quoting no international freight,
 * not answering with a 500.
 */

/** All arrival points with their rates, active first, then by name. */
export const getArrivalPoints = cache(async (): Promise<ArrivalPointConfig[]> => {
  try {
    const rows = await prisma.arrivalPoint.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { rates: true },
    });
    const config = await getAbroadConfig();
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      city: p.city,
      // A point whose duty was never set falls back to the platform figure
      // rather than quoting a duty-free import, which no imported consignment is.
      dutyPercent: p.dutyPercent > 0 ? p.dutyPercent : config.defaultDutyPercent,
      clearingFee: p.clearingFee,
      hubPickupId: p.hubPickupId,
      isActive: p.isActive,
      rates: p.rates.map((r) => ({
        originCountry: r.originCountry || ANY,
        mode: r.mode || ANY,
        ratePerCbm: r.ratePerCbm,
        ratePerKg: r.ratePerKg,
        minCharge: r.minCharge,
        transitDays: r.transitDays,
      })),
    }));
  } catch {
    return [];
  }
});

/** Only the points a seller may choose when listing a product. */
export async function getActiveArrivalPoints(): Promise<ArrivalPointConfig[]> {
  return (await getArrivalPoints()).filter((p) => p.isActive);
}

/** One point by id, or null. Includes inactive points, so an existing listing
 *  pointed at a retired point still prices instead of silently going free. */
export async function getArrivalPoint(id: string | null | undefined): Promise<ArrivalPointConfig | null> {
  if (!id) return null;
  return (await getArrivalPoints()).find((p) => p.id === id) ?? null;
}

/** A lookup keyed by id, for pricing a whole cart in one pass. */
export async function getArrivalPointMap(): Promise<Map<string, ArrivalPointConfig>> {
  return new Map((await getArrivalPoints()).map((p) => [p.id, p]));
}
