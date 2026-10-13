import { NETWORKS, type Network } from "../networks.ts";

/**
 * Which MTN product a bundle size corresponds to.
 *
 * MADAPI identifies what is being transferred by `productCode` (or
 * `productId`) — codes issued per account, which no amount of reading the
 * specification will tell you. They are therefore typed in by an admin on the
 * Developer tab rather than derived from anything.
 *
 * It is stored as text, one bundle per line:
 *
 *     5 = MTN_DATA_5GB
 *     10 = MTN_DATA_10GB      # trailing comments are ignored
 *     1.5 = MTN_DATA_1500MB
 *
 * Stored that way, but no longer *typed* that way. The console builds a field
 * per bundle from the price ladder itself (see `productRows`), so the list of
 * sizes needing a code is the list of sizes actually sold — add a bundle on
 * the Bundle prices tab and a row for it appears here, with no second place to
 * remember to update. A text format underneath keeps it one settings row and
 * keeps this module pure, and it still has to be parsed defensively: a line it
 * cannot read is reported rather than dropped, so a value that somehow got
 * mangled surfaces in the console instead of as an order that will not route.
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
export function sizeKey(sizeGb: number): number {
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

// ---------------------------------------------------------------------------
// The console's view: one row per bundle in the ladder
// ---------------------------------------------------------------------------

/**
 * The field-name contract between the console's form and the action that
 * saves it: one input per bundle size, named by that size, plus a marker
 * saying the product-code form is the one that was submitted.
 *
 * Here, in a pure module, rather than beside the action. A "use server" file
 * may export only async functions — exporting a constant from one does not
 * fail to compile, it silently voids every export in the module, and the page
 * dies at render with "the module has no exports at all". Keeping shared
 * constants out of those files is the only reliable guard.
 */
export const CODE_FIELD_PREFIX = "mtnCode__";
export const PRODUCT_CODES_SUBMITTED = "mtnProductCodesSubmitted";

export interface ProductRow {
  sizeGb: number;
  /** The code typed for this size, or "" when there is none yet. */
  code: string;
  /** Whether the bundle is on sale on the storefront right now. */
  isActive: boolean;
}

export interface ProductRows {
  /** One per MTN bundle in the price ladder, smallest first. */
  ladder: ProductRow[];
  /**
   * Codes for sizes that are no longer in the ladder.
   *
   * Kept rather than discarded. A bundle deleted by accident, or taken off and
   * put back next month, should not cost somebody the job of finding its code
   * again — and silently dropping something an admin typed is the kind of data
   * loss nobody notices until it matters.
   */
  orphans: ProductRow[];
}

/**
 * Turn the stored mapping and the live ladder into the rows the console edits.
 *
 * The ladder is the source of truth for *which* sizes need a code; the mapping
 * only supplies the values. That is what keeps the two from drifting: there is
 * no list of sizes maintained here that could fall behind the one being sold.
 *
 * Inactive bundles get a row too, marked as such, so a code can be set before
 * the size goes on sale. Switching a bundle on otherwise leaves it routing to
 * the old provider until somebody remembers to come back here.
 */
export function productRows(
  mapping: ProductMapping,
  bundles: Array<{ network: string; sizeGb: number; isActive: boolean }>,
): ProductRows {
  const ladder: ProductRow[] = [];
  const inLadder = new Set<number>();

  for (const bundle of bundles) {
    if (bundle.network !== "MTN") continue;
    const key = sizeKey(bundle.sizeGb);
    if (inLadder.has(key)) continue; // defensive: the table is unique on (network, size)
    inLadder.add(key);
    ladder.push({
      sizeGb: key,
      code: mapping.codes.get(key) ?? "",
      isActive: bundle.isActive,
    });
  }
  ladder.sort((a, b) => a.sizeGb - b.sizeGb);

  const orphans: ProductRow[] = [...mapping.codes.entries()]
    .filter(([size]) => !inLadder.has(size))
    .map(([sizeGb, code]) => ({ sizeGb, code, isActive: false }))
    .sort((a, b) => a.sizeGb - b.sizeGb);

  return { ladder, orphans };
}

/**
 * Back to the stored form.
 *
 * Sorted by size and with empty codes dropped, so the stored value is stable:
 * saving the same form twice writes the same string, and a size whose code was
 * cleared leaves no blank line behind to be reported as unreadable later.
 */
export function serialiseProductMapping(
  entries: Iterable<[number, string]>,
): string {
  return [...entries]
    .map(([sizeGb, code]) => [sizeKey(sizeGb), code.trim()] as const)
    .filter(([sizeGb, code]) => Number.isFinite(sizeGb) && sizeGb > 0 && code !== "")
    .sort((a, b) => a[0] - b[0])
    .map(([sizeGb, code]) => `${sizeGb} = ${code}`)
    .join("\n");
}
