import { NETWORKS, type Network } from "../networks.ts";

/**
 * Which upstream delivers a given bundle, and under what id.
 *
 * Pure module with no imports beyond the network list, because this is the
 * decision that moves live orders onto a different provider and it must be
 * inspectable on its own. Everything it needs is passed in; it reads no
 * settings, calls nothing, and knows about no carrier in particular.
 *
 * That last part is the point of this file's shape. There are two ways to
 * deliver a bundle today — the reseller that has always done it, and MTN's own
 * transfer API — and there will be more: Telecel and AirtelTigo have APIs of
 * their own being worked on. So a carrier is described to this function rather
 * than known by it. Adding one is a new adapter and a row in the registry; not
 * a new branch here, and not a new `if` in fulfilment.
 *
 * The governing rule survives all of that: **every doubt resolves to the
 * reseller**. A carrier that does not cover this network, a switch that is
 * off, a half-configured account, a size with no product code — each means
 * "deliver it the way it has always been delivered", never "fail". A new
 * integration must never strand an order somebody has already paid for.
 *
 * Each decision carries the reason it was made, because the console's only
 * honest answer to "why did that order not go through MTN?" is this function's
 * own sentence.
 */

/**
 * The carriers that can have an adapter. A carrier is a company we hold
 * credentials with, which is not the same as a network: AirtelTigo sells both
 * iShare and BigTime through one account, so one carrier covers two of our
 * networks.
 */
export const CARRIER_IDS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
export type CarrierId = (typeof CARRIER_IDS)[number];

/** The reseller that has always fulfilled every order. */
export const RESELLER_ROUTE = "JUSTICE";

/** Where an order can be sent: the reseller, or one of the carriers direct. */
export type FulfilmentRoute = typeof RESELLER_ROUTE | CarrierId;

export function isCarrierId(value: unknown): value is CarrierId {
  return typeof value === "string" && (CARRIER_IDS as readonly string[]).includes(value);
}

export function isFulfilmentRoute(value: unknown): value is FulfilmentRoute {
  return value === RESELLER_ROUTE || isCarrierId(value);
}

/**
 * Read a stored route. Anything unrecognised — including the null on every
 * order placed before any of this existed — is the reseller.
 */
export function normaliseRoute(value: string | null | undefined): FulfilmentRoute {
  return isFulfilmentRoute(value) ? value : RESELLER_ROUTE;
}

/** What the console and the router need to know about a carrier to route to it. */
export interface CarrierSummary {
  id: CarrierId;
  /** How it reads in the console, e.g. "MTN Customer Data Transfer". */
  label: string;
  /** The networks this carrier can deliver to. */
  networks: readonly Network[];
  /** Whether everything it needs is present. */
  ready: boolean;
  /** What is missing, when it is not ready. */
  missing: readonly string[];
  /**
   * Whether it addresses a bundle by a per-size product code. A carrier that
   * takes a plain volume does not, and must not be blocked for want of one.
   */
  usesProductCodes: boolean;
}

export interface RouteInput {
  network: string;
  sizeGb: number;
  /** The carrier covering this network, or null when none does yet. */
  carrier: CarrierSummary | null;
  /** What the admin chose for this network. Anything else means the reseller. */
  routeSetting: string | null | undefined;
  /** The product code mapped to this size, or null when there is none. */
  productCode: string | null;
}

export interface RouteDecision {
  route: FulfilmentRoute;
  /** Why — shown in the console and written onto the order's message trail. */
  reason: string;
  /** Set only when the decision is a carrier that uses product codes. */
  productCode?: string;
}

export function decideRoute(input: RouteInput): RouteDecision {
  const { carrier } = input;

  if (!carrier) {
    return {
      route: RESELLER_ROUTE,
      reason: "No direct carrier API covers this network yet.",
    };
  }
  if (normaliseRoute(input.routeSetting) !== carrier.id) {
    return { route: RESELLER_ROUTE, reason: `The ${carrier.label} route is switched off.` };
  }
  if (!carrier.ready) {
    return {
      route: RESELLER_ROUTE,
      reason: `The ${carrier.label} route is switched on but is not fully configured.`,
    };
  }
  if (carrier.usesProductCodes && !input.productCode) {
    return {
      route: RESELLER_ROUTE,
      reason: `No ${carrier.label} product code is mapped for ${input.sizeGb}GB.`,
    };
  }

  return {
    route: carrier.id,
    reason: `Delivered directly by ${carrier.label}.`,
    ...(input.productCode ? { productCode: input.productCode } : {}),
  };
}

/** True when `value` names one of the networks we sell. Guards a stored route. */
export function isKnownNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Correlation ids
// ---------------------------------------------------------------------------

/**
 * The transaction id an order is placed under, for a carrier that expects one
 * from us rather than issuing its own.
 *
 * The reseller hands back an order id; MADAPI answers about the id we send,
 * and a carrier API is as likely to do one as the other. Where it is ours to
 * supply, deriving it from the order's own reference is what makes a repeated
 * dispatch safe: the same attempt presents the same id, so a transfer the
 * carrier already holds is recognisable rather than bought twice.
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
export function carrierTransactionId(reference: string, salt?: Date | string | null): string {
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
