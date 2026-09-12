// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. Safe because nothing here is ever emitted — the same
// reason allowImportingTsExtensions is on in tsconfig.
import { createHmac, timingSafeEqual } from "node:crypto";
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

/**
 * How the two businesses are settling right now.
 *
 * Until the mall is given its own Paystack account it shares the bundle
 * business's key, which works — see signerMaySettle — but means both
 * businesses' money lands in one bank account. That state is invisible from
 * the outside: nothing errors, payments go through, and the only way to tell
 * is to compare the two keys. So it is named here and reported in the admin,
 * because "did the new key take effect?" is otherwise a question you can only
 * answer by placing a real order and looking at a bank statement.
 *
 * Takes the keys rather than reading the environment so it can be tested; the
 * wrapper that supplies them lives in lib/payments with the other secrets, and
 * only ever passes them in — no caller of this ever sees a key.
 */
export type AccountSplit = "unconfigured" | "shared" | "separate";

export function accountSplit(
  retailSecret: string | undefined,
  dataSecret: string | undefined,
): AccountSplit {
  if (!retailSecret) return "unconfigured";
  if (dataSecret && retailSecret === dataSecret) return "shared";
  return "separate";
}

/** One configured key and the businesses it settles for. */
export interface Signer {
  secret: string;
  accounts: PaymentAccount[];
}

/**
 * Which configured key signed this event, as the businesses that key settles.
 *
 * Paystack signs with the account's own secret, so the signature is the only
 * evidence of which business an event came from. This is the step that changes
 * behaviour on the day a second key is added — until then one key matches
 * everything, afterwards each key matches only its own account's events — and
 * getting it wrong drops real payments with a 200 that stops Paystack
 * retrying. So it lives here, out of the route, where it can be tested against
 * two keys before there are two keys in production.
 *
 * Every key is compared in full even after a match: returning early would make
 * the work done depend on which account signed.
 */
export function selectSigner(
  raw: string,
  signature: string,
  signers: readonly Signer[],
): PaymentAccount[] | null {
  let matched: PaymentAccount[] | null = null;
  const sigBuf = Buffer.from(signature);
  for (const { secret, accounts } of signers) {
    const expBuf = Buffer.from(createHmac("sha512", secret).update(raw).digest("hex"));
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) matched = accounts;
  }
  return matched;
}
