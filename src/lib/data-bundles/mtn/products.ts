import { NETWORKS, type Network } from "../networks.ts";

/**
 * Which MTN product a bundle size corresponds to.
 *
 * MADAPI identifies what is being transferred by `productCode` (or
 * `productId`) — codes issued per account, which no amount of reading the
 * specification will tell you. They are therefore typed in by an admin on the
 * Developer tab rather than derived from anything.
 *
 * The mapping is free text, one bundle per line:
 *
 *     5 = MTN_DATA_5GB
 *     10 = MTN_DATA_10GB      # trailing comments are ignored
 *     1.5 = MTN_DATA_1500MB
 *
 * Free text rather than a column on each bundle because the whole integration
 * is meant to live in one place an admin can see at once, and because a code
 * that applies to a size nobody sells yet should still be expressible. The
 * cost of that choice is that it has to be parsed defensively, which is what
 * this module is: a line it cannot read is reported rather than dropped, so a
 * typo surfaces in the console instead of as an order that will not route.
 *
 * Pure module, so the admin form, the router and the tests agree.
 */

export interface ProductMapping {
  /** Bundle size in GB → the MTN product code for it. */
  codes: Map<number, string>;
  /** Lines that could not be read, as typed, for the admin to fix. */
  problems: string[];
}

/** A size is matched to the nearest hundredth, so 1.5 and 1.50 are one bundle. */
function sizeKey(sizeGb: number): number {
  return Math.round(sizeGb * 100) / 100;
}

/**
 * Read the mapping an admin typed.
 *
 * Deliberately forgiving about shape — `=`, `:` and whitespace all separate a
 * size from its code, because the difference between them is not something
 * anybody should have to get right — and deliberately strict about content: a
 * size that is not a positive number, or a line with no code on it, is a
 * problem rather than a silently skipped row.
 */
export function parseProductMapping(raw: string | null | undefined): ProductMapping {
  const codes = new Map<number, string>();
  const problems: string[] = [];

  for (const line of (raw ?? "").split(/\r?\n/)) {
    // Strip a trailing comment, then whitespace. An empty line is not a problem.
    const text = line.replace(/#.*$/, "").trim();
    if (text === "") continue;

    const match = /^([0-9]+(?:\.[0-9]+)?)\s*[=:\s]\s*(.+)$/.exec(text);
    if (!match) {
      problems.push(text);
      continue;
    }

    const size = Number(match[1]);
    const code = match[2].trim();
    if (!Number.isFinite(size) || size <= 0 || code === "") {
      problems.push(text);
      continue;
    }

    codes.set(sizeKey(size), code);
  }

  return { codes, problems };
}

/** The product code for one bundle size, or null when none is mapped. */
export function productCodeFor(mapping: ProductMapping, sizeGb: number): string | null {
  return mapping.codes.get(sizeKey(sizeGb)) ?? null;
}

/**
 * Bundle sizes that are on sale but have no product code.
 *
 * The admin console shows this so the gap is visible *before* the switch is
 * thrown, rather than discovered one failed order at a time. Only MTN sizes
 * count — the other networks never route this way.
 */
export function unmappedSizes(
  mapping: ProductMapping,
  bundles: Array<{ network: string; sizeGb: number; isActive: boolean }>,
): number[] {
  const missing = new Set<number>();
  for (const bundle of bundles) {
    if (bundle.network !== "MTN" || !bundle.isActive) continue;
    if (!productCodeFor(mapping, bundle.sizeGb)) missing.add(sizeKey(bundle.sizeGb));
  }
  return [...missing].sort((a, b) => a - b);
}

/** True when `value` names one of the networks we sell. Guards a stored route. */
export function isKnownNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value);
}
