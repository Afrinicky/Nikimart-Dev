import "server-only";
import type { DataOrderStatus, Network } from "@/lib/data-bundles/networks";
import {
  carrierCatalogById,
  carrierCatalogForNetwork,
  type CarrierId,
  type CarrierSummary,
} from "@/lib/data-bundles/carriers/rules";
import { mtnAdapter } from "@/lib/data-bundles/mtn/adapter";

/**
 * The carriers we can deliver through directly, and what one has to provide to
 * be one.
 *
 * There is one today — MTN — and Telecel and AirtelTigo are being worked on.
 * This file exists so that adding them is a new adapter and a line in the list
 * below, rather than another branch in fulfilment, another `if` in the router
 * and another special case in the console.
 *
 * The interface is deliberately wider than MTN needs, because the two shapes a
 * carrier API comes in are genuinely different and we do not yet know which
 * the other two are:
 *
 *   transfer     data moves out of a line we own, addressed by a product code
 *                per bundle size. The carrier answers about a transaction id
 *                we supply. MTN is this.
 *   wholesale    a bundle is bought for a number and the carrier issues its
 *                own order id. The reseller is this, and a carrier API may be.
 *
 * `usesProductCodes` and letting the adapter return its own `providerOrderId`
 * are what span the two: a wholesale carrier reports the id it issued and
 * declares that it needs no codes, and the router and the console adjust
 * without knowing which kind they are dealing with.
 */

/** What an adapter is asked to do when an order is dispatched. */
export interface CarrierOrderInput {
  /** Our own order reference, e.g. ND-… It is also the correlation seed. */
  reference: string;
  network: Network;
  sizeGb: number;
  /** Local Ghana number, 0XXXXXXXXX. The adapter formats it as it needs. */
  recipientPhone: string;
  /** The code mapped to this size, or null for a carrier that needs none. */
  productCode: string | null;
  /**
   * The *previous* attempt's dispatch time, or null on a first dispatch. An
   * adapter that mints its own correlation id passes this to
   * `carrierTransactionId` so a deliberate re-order cannot collide with the
   * attempt it replaces.
   */
  dispatchedAt?: Date | null;
  /** Absolute URL for status callbacks, already carrying its signed token. */
  callbackUrl?: string;
}

/** What an adapter reports back. Shared with the reseller path in routing.ts. */
export interface CarrierPlacement {
  ok: boolean;
  message: string;
  /** The upstream reference to store: their order id, or our transaction id. */
  providerOrderId: string | null;
  providerCode: string | null;
  /** The carrier's own status word, kept for display. */
  providerStatus: string | null;
  /** That status in our vocabulary. */
  status: DataOrderStatus;
  /** What it cost in GH₵, where the carrier said. Null when it did not. */
  charged: number | null;
}

export interface CarrierStatusRead {
  ok: boolean;
  message: string;
  providerStatus: string | null;
  /** Already mapped — only the carrier knows how to read its own words. */
  status: DataOrderStatus | null;
}

/**
 * One environment variable an adapter reads, for the console's status panel.
 *
 * `set` is whether a value is present — never the value. This type is what
 * crosses to the browser, so there is deliberately nowhere in it to put a
 * credential, even a masked one.
 */
export interface CarrierEnvVar {
  name: string;
  label: string;
  required: boolean;
  set: boolean;
  /** What the code falls back to when it is unset, where there is one. */
  fallback?: string;
}

export interface CarrierAdapter {
  /** Which catalogue entry this implements. Its label and networks come from
   *  there, so an adapter cannot disagree with the console about what it
   *  serves. */
  id: CarrierId;
  /** Whether it addresses a bundle by a per-size product code. */
  usesProductCodes: boolean;
  /** Every variable it reads, and whether each is set. Values never included. */
  envVars(): CarrierEnvVar[];
  /** Whether everything it needs is present; `missing` names the variables. */
  readiness(): { ready: boolean; missing: string[] };
  place(input: CarrierOrderInput): Promise<CarrierPlacement>;
  /** Re-read one order the carrier is holding. */
  readStatus(providerOrderId: string): Promise<CarrierStatusRead>;
  /**
   * Prove the credentials work without moving anything, where the carrier
   * offers a way. The console's Test button; omitted when there is none.
   */
  test?(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Every carrier with an adapter.
 *
 * Add one here and it appears in the console with its own route switch, its
 * own environment panel and — if it uses them — its own product code list,
 * with no other file needing to know it exists.
 */
export const CARRIERS: readonly CarrierAdapter[] = [mtnAdapter];

/** The carrier covering a network, or null when none has an adapter yet. */
export function carrierForNetwork(network: string): CarrierAdapter | null {
  const entry = carrierCatalogForNetwork(network);
  return entry ? carrierById(entry.id) : null;
}

export function carrierById(id: string): CarrierAdapter | null {
  return CARRIERS.find((c) => c.id === id) ?? null;
}

/** The routing view of a carrier: what `decideRoute` needs, nothing more. */
export function summarise(adapter: CarrierAdapter): CarrierSummary {
  const { ready, missing } = adapter.readiness();
  const entry = carrierCatalogById(adapter.id);
  return {
    id: adapter.id,
    label: entry?.productLabel ?? adapter.id,
    networks: entry?.networks ?? [],
    ready,
    missing,
    usesProductCodes: adapter.usesProductCodes,
  };
}

/** The same, for the network an order is on. Null when nothing covers it. */
export function summaryForNetwork(network: string): CarrierSummary | null {
  const adapter = carrierForNetwork(network);
  return adapter ? summarise(adapter) : null;
}
