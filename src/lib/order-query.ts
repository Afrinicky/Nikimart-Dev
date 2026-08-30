/**
 * Deciding what somebody typed into "Track an order".
 *
 * There are two entirely separate order tables behind one search box. A
 * marketplace purchase is an `Order` keyed by `orderNumber` (NM-…); a data
 * bundle is a `DataOrder` keyed by `reference` (ND-…), and an AFA registration
 * is an `AfaRegistration` (NA-…). A bundle is also bought without an account,
 * so the phone number paid with is a key too.
 *
 * The public tracker used to search none of them — it looked in a hardcoded
 * array of four demo orders, so every real customer was told their order did
 * not exist. This is the routing that replaces it.
 *
 * Pure and dependency-light on purpose: it decides where a query goes before
 * any database is touched, and it is unit-tested directly.
 */

// Relative, not "@/…": these are value imports, and the test runner
// (node --test --experimental-strip-types) resolves no path aliases. Type-only
// aliases are fine because they are erased, which is why other pure modules
// here still use them.
import { AFA_REFERENCE_PREFIX, DATA_REFERENCE_PREFIX } from "./data-bundles/reference.ts";
import { toLocalGhPhone } from "./data-bundles/networks.ts";

export type OrderQueryRoute =
  /** Nothing usable was typed. */
  | { kind: "empty" }
  /** Look this up in the data-bundle store (reference, AFA, or phone). */
  | { kind: "data"; query: string }
  /** Look this up as a marketplace order number. */
  | { kind: "marketplace"; orderNumber: string };

/** The shortest thing worth running a query for. */
const MIN_LENGTH = 4;

export function classifyOrderQuery(raw: string | null | undefined): OrderQueryRoute {
  const q = (raw ?? "").trim();
  if (q.length < MIN_LENGTH) return { kind: "empty" };

  const upper = q.toUpperCase();

  // An explicit data or AFA reference. Checked before the phone test because a
  // reference is unambiguous and cheap to recognise.
  if (upper.startsWith(DATA_REFERENCE_PREFIX) || upper.startsWith(AFA_REFERENCE_PREFIX)) {
    return { kind: "data", query: upper };
  }

  // A Ghana mobile number only ever identifies a bundle buyer: marketplace
  // orders are tied to an account, not to the number that paid.
  if (toLocalGhPhone(q)) return { kind: "data", query: q };

  // Everything else is treated as a marketplace order number. Order numbers are
  // uppercase (NM-…), and people paste them out of an SMS in any case.
  return { kind: "marketplace", orderNumber: upper };
}
