import "server-only";
import { siteUrl } from "@/lib/site";
import { callbackToken } from "@/lib/data-bundles/callback-token";
import { mapProviderStatus, type DataOrderStatus, type Network } from "@/lib/data-bundles/networks";
import {
  createProviderOrder,
  getProviderOrder,
  isDataProviderConfigured,
} from "@/lib/data-bundles/provider";
import { getMtnConfig, type MtnConfig } from "@/lib/data-bundles/mtn/config";
import { transferDataBundle, transferStatus } from "@/lib/data-bundles/mtn/client";
import { mapMtnStatus, mtnMessage, mtnValueCharged } from "@/lib/data-bundles/mtn/status";
import { productCodeFor } from "@/lib/data-bundles/mtn/products";
import { toMtnMsisdn } from "@/lib/data-bundles/mtn/msisdn";
import {
  decideRoute,
  mtnTransactionId,
  normaliseRoute,
  type FulfilmentRoute,
  type RouteDecision,
} from "@/lib/data-bundles/mtn/route-rules";

/**
 * One door between fulfilment and whoever actually delivers the data.
 *
 * `fulfillment.ts` owns the order's lifecycle — the guarded claim that stops a
 * bundle being bought twice, the commission that is only paid on delivery, the
 * notifications — and none of that cares which upstream is used. So the whole
 * difference between the two providers is here, behind two functions that
 * answer in one shape.
 *
 * What that buys: the live fulfilment path gains four lines and no new
 * branching, and a route that is off or half-configured is handled *before*
 * fulfilment sees it, by `decideRoute`, which always has an answer and whose
 * answer in any doubt is the provider that has always delivered.
 */

export type { FulfilmentRoute, RouteDecision };

/** What a dispatch needs to know about the order it is sending. */
export interface OrderForDispatch {
  reference: string;
  network: string;
  sizeGb: number;
  recipientPhone: string;
  /** The previous attempt's dispatch time, where there was one. Null on a
   *  first dispatch. It is what gives a deliberate re-order a fresh MTN
   *  transaction id instead of colliding with the attempt that failed. */
  dispatchedAt?: Date | null;
}

/** The result of handing an order to an upstream, however it was handed over. */
export interface PlacedOrder {
  ok: boolean;
  message: string;
  route: FulfilmentRoute;
  /** The upstream reference to store: their order id, or our MTN transaction id. */
  providerOrderId: string | null;
  providerCode: string | null;
  /** The upstream's own status word, kept for display. */
  providerStatus: string | null;
  /** That status in our vocabulary. */
  status: DataOrderStatus;
  /** What it cost in GH₵, where the upstream said. Null when it did not. */
  charged: number | null;
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

/**
 * The route an order would take right now, and why.
 *
 * Exported for the console, which has to be able to say what *would* happen
 * before an admin throws the switch — and, afterwards, why a particular order
 * did not go the way they expected.
 */
export async function routeFor(
  order: { network: string; sizeGb: number },
  config?: MtnConfig,
): Promise<RouteDecision> {
  const mtn = config ?? (await getMtnConfig());
  return decideRoute({
    network: order.network,
    sizeGb: order.sizeGb,
    mtnRouteEnabled: mtn.routeEnabled,
    mtnReady: mtn.isReady,
    productCode: productCodeFor(mtn.products, order.sizeGb),
  });
}

/** The status callback for one reference on one route. */
function callbackUrlFor(reference: string, route: FulfilmentRoute): string | undefined {
  const token = callbackToken(reference);
  if (!token) return undefined; // no AUTH_SECRET → no callback we could trust
  const path =
    route === "MTN" ? "/api/data-bundles/mtn/callback" : "/api/data-bundles/webhook";
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
 * routed to MTN does not need that key, and refusing to dispatch it for want
 * of one would make the MTN route silently depend on a credential it never
 * uses. So the question is asked of the route that will actually be used.
 *
 * The reseller's wording is kept exactly as it was, because it is what an
 * admin has been reading on stalled orders for as long as this has existed.
 */
export async function canDispatch(order: {
  network: string;
  sizeGb: number;
}): Promise<{ ok: boolean; message: string; waitingMessage: string }> {
  const decision = await routeFor(order);

  if (decision.route === "MTN") {
    // The route only resolves to MTN when the configuration is complete, so
    // reaching here means it is ready. The branch exists so that adding a
    // third route cannot accidentally inherit the reseller's check.
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
  const mtn = await getMtnConfig();
  const decision = await routeFor(order, mtn);

  if (decision.route === "MTN" && decision.productCode) {
    return placeViaMtn(order, mtn, decision.productCode);
  }
  return placeViaJustice(order);
}

async function placeViaJustice(order: OrderForDispatch): Promise<PlacedOrder> {
  const res = await createProviderOrder({
    phone: order.recipientPhone,
    size: order.sizeGb,
    network: order.network as Network,
    callback: callbackUrlFor(order.reference, "JUSTICE"),
  });

  if (!res.ok || !res.payload?.id) {
    return {
      ok: false,
      message: res.message,
      route: "JUSTICE",
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
    route: "JUSTICE",
    providerOrderId: res.payload.id,
    providerCode: res.payload.orderCode ?? null,
    providerStatus: res.payload.status ?? null,
    status: mapProviderStatus(res.payload.status),
    charged: typeof res.payload.price === "number" ? res.payload.price / 100 : null,
  };
}

async function placeViaMtn(
  order: OrderForDispatch,
  config: MtnConfig,
  productCode: string,
): Promise<PlacedOrder> {
  const receiver = toMtnMsisdn(order.recipientPhone, config.msisdnFormat);
  if (!receiver) {
    // Nothing was sent, so nothing was spent. Reported as a failed dispatch
    // rather than quietly rerouted: a recipient number this layer cannot read
    // is a problem with the order, and the other provider would reject it too.
    return {
      ok: false,
      message: `${order.recipientPhone} is not a number MTN can credit.`,
      route: "MTN",
      providerOrderId: null,
      providerCode: null,
      providerStatus: null,
      status: "failed",
      charged: null,
    };
  }

  // Derived from the order, never generated fresh here — it is what makes a
  // repeated dispatch safe. See mtnTransactionId.
  const transactionId = mtnTransactionId(order.reference, order.dispatchedAt ?? null);

  const res = await transferDataBundle(config, {
    receiverMsisdn: receiver,
    productCode,
    transactionId,
    callbackUrl: config.callbackEnabled ? callbackUrlFor(order.reference, "MTN") : undefined,
  });

  const envelope = res.payload;
  const status = envelope
    ? mapMtnStatus({
        statusCode: envelope.statusCode,
        transactionState: envelope.data?.transactionState,
      })
    : "failed";

  // MTN can answer 200 with a rejecting statusCode — that is a transfer that
  // did not happen, and it must not be stored as one that did.
  if (!res.ok || status === "failed") {
    return {
      ok: false,
      message: res.message,
      route: "MTN",
      providerOrderId: null,
      providerCode: null,
      providerStatus: envelope?.data?.transactionState ?? envelope?.statusCode ?? null,
      status: "failed",
      charged: null,
    };
  }

  return {
    ok: true,
    message: res.message,
    route: "MTN",
    // MADAPI answers about the id we sent, so that id *is* the upstream
    // reference — there is no other one to store.
    providerOrderId: transactionId,
    providerCode: envelope?.data?.productCode ?? productCode,
    providerStatus: envelope?.data?.transactionState ?? null,
    status,
    charged: mtnValueCharged(envelope?.data?.valueCharged, envelope?.data?.unit),
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

  if (normaliseRoute(order.fulfilledBy) === "MTN") {
    const config = await getMtnConfig();
    // Deliberately not gated on `isReady`: an order already sent through MTN
    // still has to be readable after the switch has been turned off again.
    if (!config.clientId || !config.clientSecret) {
      return {
        ok: false,
        message: "MTN credentials are no longer configured.",
        providerStatus: null,
        status: null,
      };
    }

    const res = await transferStatus(config, order.providerOrderId);
    const envelope = res.payload;
    if (!res.ok || !envelope) {
      return { ok: false, message: res.message, providerStatus: null, status: null };
    }

    return {
      ok: true,
      message: mtnMessage({
        statusCode: envelope.statusCode,
        statusMessage: envelope.statusMessage,
        supportMessage: envelope.supportMessage,
        downstreamStatusCode: envelope.downstreamStatusCode,
        transactionState: envelope.data?.transactionState,
      }),
      providerStatus: envelope.data?.transactionState ?? envelope.statusCode ?? null,
      status: mapMtnStatus({
        statusCode: envelope.statusCode,
        transactionState: envelope.data?.transactionState,
      }),
    };
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
