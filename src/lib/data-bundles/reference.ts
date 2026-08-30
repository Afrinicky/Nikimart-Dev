/**
 * How a data-bundle reference is recognised.
 *
 * Pure module — no `server-only`, no imports — because the prefixes are needed
 * in three places that cannot all reach a server module: the Paystack webhook
 * deciding whether a reference is ours, the public order tracker deciding which
 * of the two order tables a query belongs to, and their tests.
 *
 * These used to live in lib/data-bundles/fulfillment, which is server-only; it
 * re-exports them so existing callers are unaffected.
 */

/** The prefix that tells the shared Paystack webhook a reference is ours. */
export const DATA_REFERENCE_PREFIX = "ND-";
export const AFA_REFERENCE_PREFIX = "NA-";

export function isDataReference(reference: string): boolean {
  return reference.startsWith(DATA_REFERENCE_PREFIX);
}

export function isAfaReference(reference: string): boolean {
  return reference.startsWith(AFA_REFERENCE_PREFIX);
}
