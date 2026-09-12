// Relative, with the extension: pulled in by a *.test.ts run through Node's
// type stripping, which resolves neither the "@/…" alias nor a missing
// extension. Safe because nothing here is ever emitted.
import { round2 } from "./agent-pricing.ts";
import { isNetwork, type Network } from "./networks.ts";

/**
 * Reading the provider's price list, as a pure module.
 *
 * The cost price is the number every other number on the bundle store is
 * measured against: the retail price, the agent price, the commission an agent
 * earns and the margin Nickimart keeps are all "cost plus something". It used
 * to be typed in by hand, which meant it was right the day it was typed and
 * quietly wrong the morning the provider moved a price — and wrong in the
 * expensive direction, because a cost that rose while the agent price stood
 * still is a bundle sold at a loss on every order.
 *
 * The parsing lives here rather than next to the fetch so it can be tested
 * against the shapes the provider actually sends, without a network in sight.
 */

export interface ProviderPackage {
  network: Network;
  /** Volume in GB, whichever unit the provider quoted. */
  sizeGb: number;
  /** What this account pays, in GH₵. */
  cost: number;
  available: boolean;
}

/**
 * The provider's size field, in GB.
 *
 * It quotes MB in the package catalogue and GB on the order API, and the same
 * key carries both. They cannot be confused: a bundle is between 1GB and 100GB,
 * so anything at or above 1000 is megabytes and anything below it is gigabytes.
 */
export function sizeToGb(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1000 ? round2(n / 1000) : round2(n);
}

/** The provider's money, in GH₵. Integer pesewas on the wire, as everywhere. */
export function priceToCedis(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n / 100);
}

/**
 * Turn the provider's rows into packages we can price against.
 *
 * Anything unrecognisable is dropped rather than guessed at: a row with a
 * network we don't sell, a size that doesn't parse, or a price of nothing would
 * each, if let through, write a zero cost onto a live bundle and make every
 * sale of it look like pure margin.
 */
export function parsePackages(rows: readonly unknown[]): ProviderPackage[] {
  const out: ProviderPackage[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;

    const network = String(record.network ?? "").trim().toUpperCase();
    if (!isNetwork(network)) continue;

    const sizeGb = sizeToGb(record.size);
    const cost = priceToCedis(record.price);
    if (sizeGb === null || cost === null || cost <= 0) continue;

    out.push({
      network,
      sizeGb,
      cost,
      // Absent means listed: the field is a withdrawal flag, and a provider
      // that stops sending it has not withdrawn its whole catalogue.
      available: record.available === undefined ? true : record.available !== false,
    });
  }
  return out;
}

/**
 * The cheapest listing per network and size.
 *
 * A catalogue can carry the same bundle more than once — tiers, promotions, a
 * withdrawn row beside its replacement. Two prices for one bundle has to
 * resolve one way every time, and the lower is the safe one: a cost recorded
 * too low understates the margin, while one recorded too high can send a
 * perfectly good bundle below the "agent price under cost" guard and take it
 * off every storefront.
 */
export function cheapestByBundle(packages: readonly ProviderPackage[]): Map<string, ProviderPackage> {
  const best = new Map<string, ProviderPackage>();
  for (const pkg of packages) {
    if (!pkg.available) continue;
    const key = bundleKey(pkg.network, pkg.sizeGb);
    const current = best.get(key);
    if (!current || pkg.cost < current.cost) best.set(key, pkg);
  }
  return best;
}

export function bundleKey(network: string, sizeGb: number): string {
  return `${network}:${sizeGb}`;
}

export interface CostChange {
  id: string;
  network: string;
  sizeGb: number;
  from: number;
  to: number;
}

export interface CostPlan {
  /** Bundles whose cost has actually moved. */
  changes: CostChange[];
  /** Bundles we sell that the provider didn't list — worth an admin's eye. */
  unmatched: Array<{ network: string; sizeGb: number }>;
}

/**
 * What to write, given what we sell and what the provider listed.
 *
 * Only bundles that exist here are touched, and only where the number actually
 * differs: a sync that rewrites every row every night buries the one night a
 * price moved under three hundred no-op writes. Sizes the provider has stopped
 * listing are reported rather than zeroed — a bundle whose cost we can no
 * longer read is still being sold at the cost we last knew.
 */
export function planCostUpdates(
  bundles: ReadonlyArray<{ id: string; network: string; sizeGb: number; costPrice: number }>,
  packages: readonly ProviderPackage[],
): CostPlan {
  const listed = cheapestByBundle(packages);
  const changes: CostChange[] = [];
  const unmatched: Array<{ network: string; sizeGb: number }> = [];

  for (const bundle of bundles) {
    const match = listed.get(bundleKey(bundle.network, bundle.sizeGb));
    if (!match) {
      unmatched.push({ network: bundle.network, sizeGb: bundle.sizeGb });
      continue;
    }
    if (round2(bundle.costPrice) !== match.cost) {
      changes.push({
        id: bundle.id,
        network: bundle.network,
        sizeGb: bundle.sizeGb,
        from: round2(bundle.costPrice),
        to: match.cost,
      });
    }
  }

  return { changes, unmatched };
}
