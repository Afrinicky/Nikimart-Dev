import "server-only";
import { siteUrl } from "@/lib/site";
import { callbackToken } from "@/lib/data-bundles/callback-token";
import { mapProviderStatus, type DataOrderStatus, type Network } from "@/lib/data-bundles/networks";
import {
  getDataSettings,
  productCodesSettingKey,
  routeSettingKey,
} from "@/lib/data-bundles/settings";
import {
  createProviderOrder,
  getProviderOrder,
  isDataProviderConfigured,
} from "@/lib/data-bundles/provider";
import {
  carrierById,
  carrierForNetwork,
  summarise,
  type CarrierPlacement,
} from "@/lib/data-bundles/carriers/registry";
import {
  decideRoute,
  normaliseRoute,
  RESELLER_ROUTE,
  type FulfilmentRoute,
  type RouteDecision,
} from "@/lib/data-bundles/carriers/rules";
import { parseProductMapping, productCodeFor } from "@/lib/data-bundles/carriers/products";

/**
 * One door between fulfilment and whoever actually delivers the data.
 *
 * `fulfillment.ts` owns the order's lifecycle — the guarded claim that stops a
 * bundle being bought twice, the commission that is only paid on delivery, the
 * notifications — and none of that cares which upstream is used. So the whole
 * difference between the reseller and a carrier's own API is here, behind two
 * functions that answer in one shape.
 *
 * Carriers are looked up in the registry rather than named here, so Telecel
 * and AirtelTigo arriving means a new adapter and nothing else: this file does
 * not change, and neither does fulfilment.
 *
 * What that buys: the live fulfilment path has no branching on provider at
 * all, and a route that is off, unbuilt or half-configured is handled *before*
 * fulfilment sees it, by `decideRoute`, whose answer in any doubt is the
 * reseller that has always delivered.
 */

export type { FulfilmentRoute, RouteDecision };

/** What a dispatch needs to know about the order it is sending. */
export interface OrderForDispatch {
  reference: string;
  network: string;
  sizeGb: number;
  recipientPhone: string;
  /** The previous attempt's dispatch time, where there was one. Null on a
   *  first dispatch. It is what gives a deliberate re-order a fresh carrier
   *  transaction id instead of colliding with the attempt that failed. */
  dispatchedAt?: Date | null;
}

/** The result of handing an order to an upstream, however it was handed over. */
export interface PlacedOrder extends CarrierPlacement {
  route: FulfilmentRoute;
}

export interface StatusRead {
  ok: boolean;
  message: string;
  providerStatus: string | null;
  /** Already mapped, because only the route knows how to read its own words. */
  status: DataOrderStatus | null;
}

// ---------------------------------------------------------------------------
// Which route
// ---------------------------------------------------------------------------

/** One network's product code for one size, from the stored mapping. */
async function productCodeForOrder(
  network: string,
  sizeGb: number,
  settings?: Record<string, string>,
): Promise<string | null> {
  const stored = settings ?? ((await getDataSettings()) as unknown as Record<string, string>);
  const key = productCodesSettingKey(network as Network);
  // The pre-multi-network key is read only when the current one is empty, so
  // codes typed before the other networks existed are not silently lost.
  const raw = stored[key] || (network === "MTN" ? stored.mtnProductCodes : "") || "";
  return productCodeFor(parseProductMapping(raw), sizeGb);
}

/**
 * The route an order would take right now, and why.
 *
 * Exported for the console, which has to be able to say what *would* happen
 * before an admin throws a switch — and, afterwards, why a particular order
 * did not go the way they expected.
 */
export async function routeFor(
  order: { network: string; sizeGb: number },
  settings?: Record<string, string>,
): Promise<RouteDecision> {
  const stored = settings ?? ((await getDataSettings()) as unknown as Record<string, string>);
  const adapter = carrierForNetwork(order.network);

  return decideRoute({
    network: order.network,
    sizeGb: order.sizeGb,
    carrier: adapter ? summarise(adapter) : null,
    routeSetting: stored[routeSettingKey(order.network as Network)],
    productCode: adapter?.usesProductCodes
      ? await productCodeForOrder(order.network, order.sizeGb, stored)
      : null,
  });
}

/** The status callback for one reference on one route. */
function callbackUrlFor(reference: string, route: FulfilmentRoute): string | undefined {
  const token = callbackToken(reference);
  if (!token) return undefined; // no AUTH_SECRET → no callback we could trust
  // One route, one path. A carrier's callback is shaped like that carrier and
  // nothing else, so parsing them in one place would mean guessing which had
  // arrived.
  const path =
    route === RESELLER_ROUTE
      ? "/api/data-bundles/webhook"
      : `/api/data-bundles/${route.toLowerCase()}/callback`;
  const url = new URL(path, siteUrl());
  url.searchParams.set("ref", reference);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Whether the upstream that *would* take this order is actually set up.
 *
 * Fulfilment used to ask whether the reseller's API key was present, which was
 * the same question when there was one provider. It is not any more: an order
 * routed to a carrier does not need that key, and refusing to dispatch it for
 * want of one would make every direct route silently depend on a credential it
 * never uses. So the question is asked of the route that will actually be
 * used.
 *
 * The reseller's wording is kept exactly as it was, because it is what an
 * admin has been reading on stalled orders for as long as this has existed.
 */
export async function canDispatch(order: {
  network: string;
  sizeGb: number;
}): Promise<{ ok: boolean; message: string; waitingMessage: string }> {
  const decision = await routeFor(order);

  if (decision.route !== RESELLER_ROUTE) {
    // The route only resolves to a carrier when its configuration is complete,
    // so reaching here means it is ready.
    return { ok: true, message: "OK", waitingMessage: "" };
  }

  if (!isDataProviderConfigured()) {
    return {
      ok: false,
      message: "The data provider is not configured.",
      waitingMessage: "Waiting for the data provider API key to be configured.",
    };
  }
  return { ok: true, message: "OK", waitingMessage: "" };
}

// ---------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------

/**
 * Hand one paid order to whichever upstream should deliver it.
 *
 * A false `ok` means nothing was spent: both branches below treat a rejected
 * request as a failed dispatch with no upstream reference stored, which is
 * what lets an admin retry it.
 */
export async function placeBundleOrder(order: OrderForDispatch): Promise<PlacedOrder> {
  const decision = await routeFor(order);

  if (decision.route !== RESELLER_ROUTE) {
    const adapter = carrierById(decision.route);
    if (adapter) {
      const placement = await adapter.place({
        reference: order.reference,
        network: order.network as Network,
        sizeGb: order.sizeGb,
        recipientPhone: order.recipientPhone,
        productCode: decision.productCode ?? null,
        dispatchedAt: order.dispatchedAt,
        callbackUrl: callbackUrlFor(order.reference, decision.route),
      });
      return { ...placement, route: decision.route };
    }
    // Decided on a carrier the registry cannot produce. Not reachable today —
    // the decision came from the registry — but delivering through the
    // reseller beats throwing on a paid order if it ever becomes reachable.
  }

  return placeViaReseller(order);
}

async function placeViaReseller(order: OrderForDispatch): Promise<PlacedOrder> {
  const res = await createProviderOrder({
    phone: order.recipientPhone,
    size: order.sizeGb,
    network: order.network as Network,
    callback: callbackUrlFor(order.reference, RESELLER_ROUTE),
  });

  if (!res.ok || !res.payload?.id) {
    return {
      ok: false,
      message: res.message,
      route: RESELLER_ROUTE,
      providerOrderId: null,
      providerCode: null,
      providerStatus: null,
      status: "failed",
      charged: null,
    };
  }

  return {
    ok: true,
    message: res.message,
    route: RESELLER_ROUTE,
    providerOrderId: res.payload.id,
    providerCode: res.payload.orderCode ?? null,
    providerStatus: res.payload.status ?? null,
    status: mapProviderStatus(res.payload.status),
    charged: typeof res.payload.price === "number" ? res.payload.price / 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Reading a status back
// ---------------------------------------------------------------------------

/** Re-read one order from whichever upstream is holding it. */
export async function readBundleStatus(order: {
  providerOrderId: string | null;
  fulfilledBy?: string | null;
}): Promise<StatusRead> {
  if (!order.providerOrderId) {
    return {
      ok: false,
      message: "This order hasn't been sent to a provider yet.",
      providerStatus: null,
      status: null,
    };
  }

  // From the row, never from today's settings: the route is a switch an admin
  // can throw at any moment, and an order placed through one upstream has to
  // stay readable afterwards.
  const route = normaliseRoute(order.fulfilledBy);
  if (route !== RESELLER_ROUTE) {
    const adapter = carrierById(route);
    if (!adapter) {
      return {
        ok: false,
        message: `No adapter for ${route} is installed any more.`,
        providerStatus: null,
        status: null,
      };
    }
    return adapter.readStatus(order.providerOrderId);
  }

  const res = await getProviderOrder(order.providerOrderId);
  if (!res.ok) return { ok: false, message: res.message, providerStatus: null, status: null };
  return {
    ok: true,
    message: res.message,
    providerStatus: res.payload?.status ?? null,
    status: mapProviderStatus(res.payload?.status),
  };
}
