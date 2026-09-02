import "server-only";
import { prisma } from "@/lib/prisma";
import { getAbroadConfig } from "@/lib/settings";
import {
  getActiveConsolidationPoints,
  getActiveForwarders,
  getShippingConfig,
} from "@/lib/shipping-config";
import type { ConsolidationPoint, Forwarder, ShippingConfig } from "@/lib/shipping";

/**
 * Everything the product form's shipping section needs, loaded once.
 *
 * Four pages render that form — admin new, admin edit, seller new, seller edit —
 * and each of them was assembling the same handful of lookups by hand. They
 * drifted: one passed the platform duty rate and another did not, so the same
 * listing estimated differently depending on which door you came in by. One
 * loader, one shape, four callers.
 */
export interface ProductShippingProps {
  points: ConsolidationPoint[];
  forwarders: Forwarder[];
  config: ShippingConfig;
  payOnPickupEnabled: boolean;
  sampleDestinationId: string;
}

export async function getProductShippingProps(): Promise<ProductShippingProps> {
  const [points, forwarders, config, abroad, stations] = await Promise.all([
    getActiveConsolidationPoints(),
    getActiveForwarders(),
    getShippingConfig(),
    getAbroadConfig(),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true },
    }),
  ]);

  // A station to price the seller's estimate against. Deliberately one the
  // goods are *not* already at where possible: an estimate that quietly picked
  // the free case would show every seller GH₵0 and teach them nothing.
  const pointStationIds = new Set(points.map((p) => p.pickupPointId).filter(Boolean));
  const sample =
    stations.find((s) => !pointStationIds.has(s.id))?.id ?? stations[0]?.id ?? "";

  return {
    points,
    forwarders,
    config,
    payOnPickupEnabled: abroad.payOnPickupEnabled,
    sampleDestinationId: sample,
  };
}
