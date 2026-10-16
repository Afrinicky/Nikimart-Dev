// Relative-safe and pure — no `server-only`, no imports — because the prefix is
// needed in two places that cannot both reach a server module: the Paystack
// webhook deciding what a reference is for, and its tests.

/**
 * An affiliate paying their registration fee.
 *
 * Deliberately not one of the data-bundle prefixes: those route a charge to the
 * bundle business's Paystack account, and an affiliate registration is retail
 * money. Routing it wrong would not error — it would verify, be attributed to
 * the wrong business and be dropped with a 200 that stops Paystack retrying.
 */
export const AFFILIATE_REFERENCE_PREFIX = "AF-";

export function isAffiliateRegistrationReference(reference: string): boolean {
  return reference.startsWith(AFFILIATE_REFERENCE_PREFIX);
}
