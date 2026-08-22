import { createHmac, timingSafeEqual } from "crypto";

/**
 * Proof that a provider status callback belongs to an order we actually placed.
 *
 * The provider signs nothing, so the callback URL has to carry that proof
 * itself. It used to be a separate shared secret someone had to generate and
 * configure, which is one more thing to get wrong for no benefit: the token is
 * now an HMAC of the order reference keyed by AUTH_SECRET, which every
 * deployment already has.
 *
 * Deriving it per reference also beats one global secret — a callback URL that
 * leaks (a provider log, say) proves nothing about any other order, because its
 * token only ever validates for the reference it was minted for.
 *
 * Server-side only, though deliberately without the `server-only` import: that
 * package throws inside the test runner, and this is the one place worth
 * testing directly — it guards the only unauthenticated route that can change
 * an order's status. Nothing is lost by leaving it off, because AUTH_SECRET
 * carries no NEXT_PUBLIC_ prefix and so is never inlined into a client bundle;
 * imported from the browser these functions would simply return null/false.
 */

function signingKey(): string | undefined {
  const key = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  return key && key.trim() ? key.trim() : undefined;
}

/** The token for one reference, or null when the app has no AUTH_SECRET. */
export function callbackToken(reference: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`data-callback:${reference}`).digest("hex").slice(0, 32);
}

/** Constant-time check of a token presented by an inbound callback. */
export function callbackTokenMatches(reference: string, provided: string): boolean {
  const expected = callbackToken(reference);
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
