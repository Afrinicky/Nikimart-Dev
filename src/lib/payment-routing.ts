// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. Safe because nothing here is ever emitted — the same
// reason allowImportingTsExtensions is on in tsconfig.
import {
  isAfaReference,
  isDataReference,
  isRegistrationReference,
} from "./data-bundles/reference.ts";

/**
 * Which business a Paystack charge belongs to, and who is allowed to settle it.
 *
 * Pure, and separate from lib/payments (which is server-only and holds secrets)
 * so the rule can be tested directly. It is worth testing: getting it wrong in
 * one direction lets one account's key settle the other's orders unpaid, and in
 * the other direction silently drops real payments — which is the harder of the
 * two to notice, because nothing errors and Paystack does not retry a 200.
 */

/** Which business a charge belongs to. */
export type PaymentAccount = "retail" | "data";

/**
 * The business a reference belongs to. "ND-"/"NA-"/"NR-" are bundle orders, AFA
 * registrations and agent registration fees; everything else is a mall order.
 */
export function accountForReference(reference: string): PaymentAccount {
  return isDataReference(reference) || isAfaReference(reference) || isRegistrationReference(reference)
    ? "data"
    : "retail";
}

/**
 * May the key that signed this event settle a charge belonging to `belongsTo`?
 *
 * A signature proves which *key* signed, not which business the charge is for.
 * So the answer depends on what that key settles for:
 *
 *   • Two distinct keys — one per business — and the signature does identify the
 *     business. The check is then worth having: without it, whoever holds one
 *     key could sign an event naming an order in the other's ledger and have it
 *     settled unpaid.
 *   • One key serving both, which is what happens until the second account is
 *     configured. The signature cannot distinguish them and there is nothing to
 *     protect against — the same key already legitimately settles both — so the
 *     reference prefix alone decides routing, exactly as it did before the
 *     accounts were split.
 *
 * Treating the shared key as belonging only to retail is the bug this function
 * exists to prevent: every bundle payment would verify, be classified as the
 * wrong business, and be dropped.
 */
export function signerMaySettle(
  signerAccounts: readonly PaymentAccount[],
  belongsTo: PaymentAccount,
): boolean {
  return signerAccounts.includes(belongsTo);
}
