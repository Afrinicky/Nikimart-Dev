/**
 * Which upstream delivers a given bundle, and under what id.
 *
 * Pure module with no imports, because this is the decision that moves live
 * orders onto a new provider and it must be inspectable on its own. Everything
 * it needs is passed in; it reads no settings and calls nothing.
 *
 * The governing rule is that **every doubt resolves to the existing provider**.
 * The MTN route is the new thing, and a new thing that is switched on but not
 * quite finished must not strand an order somebody has already paid for. So a
 * missing product code, a half-filled form or a network MTN cannot credit all
 * mean "deliver it the way it has always been delivered" — never "fail".
 *
 * Each decision carries the reason it was made, because the admin console's
 * only honest answer to "why did that order not go through MTN?" is this
 * function's own sentence.
 */

export const FULFILMENT_ROUTES = ["JUSTICE", "MTN"] as const;
export type FulfilmentRoute = (typeof FULFILMENT_ROUTES)[number];

export function isFulfilmentRoute(value: unknown): value is FulfilmentRoute {
  return typeof value === "string" && (FULFILMENT_ROUTES as readonly string[]).includes(value);
}

/**
 * Read a stored route. Anything unrecognised — including the null on every
 * order placed before this existed — is the original provider.
 */
export function normaliseRoute(value: string | null | undefined): FulfilmentRoute {
  return isFulfilmentRoute(value) ? value : "JUSTICE";
}

export interface RouteInput {
  network: string;
  sizeGb: number;
  /** The admin's switch on the Developer tab. */
  mtnRouteEnabled: boolean;
  /** Whether everything a transfer needs is actually filled in. */
  mtnReady: boolean;
  /** The product code mapped to this size, or null when there is none. */
  productCode: string | null;
}

export interface RouteDecision {
  route: FulfilmentRoute;
  /** Why — shown in the console and written onto the order's message trail. */
  reason: string;
  /** Set only on an MTN decision. */
  productCode?: string;
}

export function decideRoute(input: RouteInput): RouteDecision {
  if (input.network !== "MTN") {
    return {
      route: "JUSTICE",
      reason: "MTN's transfer API can only credit an MTN subscriber.",
    };
  }
  if (!input.mtnRouteEnabled) {
    return { route: "JUSTICE", reason: "The MTN route is switched off." };
  }
  if (!input.mtnReady) {
    return {
      route: "JUSTICE",
      reason: "The MTN route is switched on but is not fully configured.",
    };
  }
  if (!input.productCode) {
    return {
      route: "JUSTICE",
      reason: `No MTN product code is mapped for ${input.sizeGb}GB.`,
    };
  }
  return {
    route: "MTN",
    reason: "Transferred from the Nickimart MTN line.",
    productCode: input.productCode,
  };
}

// ---------------------------------------------------------------------------
// Correlation ids
// ---------------------------------------------------------------------------

/**
 * The `transactionId` a transfer is made under.
 *
 * MADAPI does not issue an order id — it answers about the id we send, which
 * puts idempotency on our side of the line. Deriving it from the order's own
 * reference is what makes a repeated dispatch safe: the same attempt presents
 * the same id, so a transfer MTN already holds is recognisable rather than
 * bought twice.
 *
 * `salt` is what distinguishes a deliberate re-order from a repeat. An admin
 * who re-orders a failed bundle means "buy it again", and that must *not*
 * collide with the attempt that failed — so the previous attempt's dispatch
 * time is mixed in, giving a fresh id per attempt while keeping each attempt's
 * own id stable.
 *
 * The result is alphanumeric and short, because an id is a correlation key on
 * somebody else's platform and the conservative assumption is that it is
 * length-limited and punctuation-shy.
 */
export function mtnTransactionId(reference: string, salt?: Date | string | null): string {
  const base = reference.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
  if (!salt) return base;

  const seed = salt instanceof Date ? String(salt.getTime()) : String(salt);
  // A small, dependency-free hash. It needs to vary per attempt and be stable
  // within one — not to be unguessable, since the id authorises nothing.
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `${base}R${hash.toString(36).toUpperCase().slice(0, 6)}`;
}
