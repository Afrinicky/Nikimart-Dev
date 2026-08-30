import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { NETWORKS, type Network } from "@/lib/data-bundles/networks";

export interface Bundle {
  id: string;
  network: Network;
  sizeGb: number;
  price: number;
  costPrice: number;
  /**
   * What Nickimart charges its own sub-agents. 0 means the bundle isn't resold
   * to agents, and it stays off every agent storefront.
   */
  agentPrice: number;
  validity: string;
  isActive: boolean;
  order: number;
}

/**
 * The starter price ladder. It seeds a fresh database (see
 * nikimart-neon-data-bundles.sql) and keeps the storefront presentable if the
 * DataBundle table isn't migrated yet.
 *
 * These are placeholder retail prices — the whole point of the admin console is
 * that you set your own. Check Admin → Data → Bundle prices against your agent
 * cost before you take orders.
 */
export const SEED_BUNDLES: Array<{ network: Network; sizeGb: number; price: number }> = [
  ...[
    [1, 6], [2, 11], [3, 16], [4, 21], [5, 26], [6, 31], [8, 40], [10, 48],
    [15, 70], [20, 90], [25, 112], [30, 132], [40, 175], [50, 215], [100, 425],
  ].map(([sizeGb, price]) => ({ network: "MTN" as Network, sizeGb, price })),
  ...[
    [5, 26], [10, 47], [15, 68], [20, 88], [25, 108], [30, 128], [40, 170],
    [50, 210], [100, 415],
  ].map(([sizeGb, price]) => ({ network: "TELECEL" as Network, sizeGb, price })),
  ...[
    [1, 5], [2, 9], [3, 14], [4, 18], [5, 22], [6, 26], [8, 34], [10, 41],
    [15, 60], [20, 79], [25, 98], [30, 117], [40, 155], [50, 192], [100, 380],
  ].map(([sizeGb, price]) => ({ network: "AIRTELTIGO_ISHARE" as Network, sizeGb, price })),
  ...[
    [25, 60], [50, 95], [75, 130], [100, 160],
  ].map(([sizeGb, price]) => ({ network: "AIRTELTIGO_BIGTIME" as Network, sizeGb, price })),
];

function fallbackBundles(): Bundle[] {
  return SEED_BUNDLES.map((b, i) => ({
    id: `seed-${b.network}-${b.sizeGb}`,
    network: b.network,
    sizeGb: b.sizeGb,
    price: b.price,
    costPrice: 0,
    // The starter ladder is a placeholder for the storefront, not a price list
    // to resell from — agents see nothing until an admin sets real numbers.
    agentPrice: 0,
    validity: "No expiry",
    isActive: true,
    order: i,
  }));
}

function toBundle(row: {
  id: string;
  network: string;
  sizeGb: number;
  price: number;
  costPrice: number;
  agentPrice: number;
  validity: string;
  isActive: boolean;
  order: number;
}): Bundle {
  return { ...row, network: row.network as Network };
}

/** Bundles buyers can see, cheapest size first, grouped by network downstream. */
export const getActiveBundles = cache(async (): Promise<Bundle[]> => {
  try {
    const rows = await prisma.dataBundle.findMany({
      where: { isActive: true, price: { gt: 0 } },
      orderBy: [{ order: "asc" }, { sizeGb: "asc" }],
    });
    if (rows.length) return rows.map(toBundle);
  } catch {
    // DataBundle table not migrated yet — show the starter ladder instead of
    // an empty store.
  }
  return fallbackBundles();
});

/** Every bundle, active or not, for the admin price manager. */
export async function getAllBundles(): Promise<Bundle[]> {
  try {
    return (
      await prisma.dataBundle.findMany({ orderBy: [{ network: "asc" }, { sizeGb: "asc" }] })
    ).map(toBundle);
  } catch {
    return [];
  }
}

/** Bundles keyed by network, in tab order, dropping networks with nothing to sell. */
export function groupByNetwork(bundles: Bundle[]): Array<{ network: Network; bundles: Bundle[] }> {
  return NETWORKS.map((network) => ({
    network,
    bundles: bundles.filter((b) => b.network === network).sort((a, b) => a.sizeGb - b.sizeGb),
  })).filter((g) => g.bundles.length > 0);
}

/**
 * Re-read one bundle by its network+size — the storefront posts those rather
 * than an id, so a stale page can never buy at a stale price.
 */
export async function findSellableBundle(network: Network, sizeGb: number): Promise<Bundle | null> {
  try {
    const row = await prisma.dataBundle.findUnique({
      where: { network_sizeGb: { network, sizeGb } },
    });
    if (row && row.isActive && row.price > 0) return toBundle(row);
    if (row) return null; // exists but withdrawn from sale
  } catch {
    // fall through to the seed ladder below
  }
  const seed = fallbackBundles().find((b) => b.network === network && b.sizeGb === sizeGb);
  return seed ?? null;
}
