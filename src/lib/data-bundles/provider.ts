import "server-only";
import type { Network } from "@/lib/data-bundles/networks";

/**
 * Justice Datashop agent API (server-only).
 *
 * Base URL and auth come straight from the agent dashboard's Developer tab:
 *   GET  /api/balance           → wallet balance, in pesewas
 *   POST /api/order             → buy a bundle for a phone number
 *   GET  /api/order/:orderId    → status of one order
 *   POST /api/afa-registration  → submit an AFA registration
 *
 * Every request carries `X-API-Key`. That key is the wallet — it must never
 * reach the browser, so this module is server-only and no route ever echoes it.
 *
 * Money on the wire is in pesewas (GH₵ × 100); everything above this layer
 * works in Cedis, so conversion happens here and nowhere else.
 */

const DEFAULT_BASE = "https://backend.justicedatashop.com";
const TIMEOUT_MS = 20_000;

export function providerBase(): string {
  const raw = process.env.JUSTICE_API_BASE?.trim();
  return (raw || DEFAULT_BASE).replace(/\/+$/, "");
}

function providerKey(): string | undefined {
  const key = process.env.JUSTICE_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

/** True when an API key is present and orders can actually be fulfilled. */
export function isDataProviderConfigured(): boolean {
  return Boolean(providerKey());
}

/** GH₵ from the provider's integer pesewas. */
export function fromPesewas(pesewas: number): number {
  return Math.round(pesewas) / 100;
}

export interface ProviderResult<T> {
  ok: boolean;
  /** Provider message, or our own description of the failure. */
  message: string;
  status: number;
  payload: T | null;
}

interface Envelope<T> {
  status?: boolean;
  statusCode?: number;
  message?: string;
  payload?: T;
}

/**
 * One API call. Never throws — callers get a ProviderResult either way, so a
 * provider outage shows up as a failed order rather than a 500 on checkout.
 */
async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ProviderResult<T>> {
  const key = providerKey();
  if (!key) {
    return { ok: false, message: "The data provider is not configured.", status: 0, payload: null };
  }

  try {
    const res = await fetch(`${providerBase()}${path}`, {
      method: init.method,
      headers: {
        "X-API-Key": key,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text().catch(() => "");
    let json: Envelope<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as Envelope<T>) : null;
    } catch {
      // Non-JSON body (an HTML error page, say) — keep the raw text as the message.
    }

    const ok = res.ok && json?.status !== false;
    const message =
      json?.message ??
      (ok ? "OK" : `Provider returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);

    return { ok, message, status: res.status, payload: json?.payload ?? null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Log without the key — the URL and method are enough to diagnose.
    console.error(`[data-bundles] ${init.method} ${path} failed: ${reason}`);
    return { ok: false, message: "Could not reach the data provider.", status: 0, payload: null };
  }
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/** Agent wallet balance in GH₵, or null when it can't be read. */
export async function getProviderBalance(): Promise<{ balance: number | null; message: string }> {
  const res = await call<number>("/api/balance", { method: "GET" });
  if (!res.ok || typeof res.payload !== "number") {
    return { balance: null, message: res.message };
  }
  return { balance: fromPesewas(res.payload), message: res.message };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** The order fields we read back. The provider sends more; we ignore the rest. */
export interface ProviderOrder {
  id?: string;
  status?: string;
  orderCode?: string;
  phone?: string;
  size?: number;
  /** Upstream price in pesewas. */
  price?: number;
  network?: string;
  source?: string;
  externalRef?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateOrderInput {
  /** Local Ghana number, 0XXXXXXXXX — the provider rejects a +233/233 prefix. */
  phone: string;
  /** Bundle volume in GB. */
  size: number;
  network: Network;
  /** Absolute URL the provider calls when the order's status changes. */
  callback?: string;
}

/** Buy a bundle. A false `ok` means nothing was charged upstream. */
export async function createProviderOrder(
  input: CreateOrderInput,
): Promise<ProviderResult<ProviderOrder>> {
  return call<ProviderOrder>("/api/order", {
    method: "POST",
    body: {
      phone: input.phone,
      size: input.size,
      network: input.network,
      ...(input.callback ? { callback: input.callback } : {}),
    },
  });
}

/** Re-read one order from the provider (used by the admin "refresh" action). */
export async function getProviderOrder(orderId: string): Promise<ProviderResult<ProviderOrder>> {
  return call<ProviderOrder>(`/api/order/${encodeURIComponent(orderId)}`, { method: "GET" });
}

// ---------------------------------------------------------------------------
// AFA registration
// ---------------------------------------------------------------------------

export interface AfaInput {
  fullName: string;
  phoneNumber: string;
  idNumber: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
  town: string;
  occupation: string;
  callback?: string;
}

export interface ProviderAfa {
  id?: string;
  fullName?: string;
  phoneNumber?: string;
  idNumber?: string;
  dateOfBirth?: string;
  town?: string;
  occupation?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function createProviderAfa(input: AfaInput): Promise<ProviderResult<ProviderAfa>> {
  return call<ProviderAfa>("/api/afa-registration", {
    method: "POST",
    body: {
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      idNumber: input.idNumber,
      dateOfBirth: input.dateOfBirth,
      town: input.town,
      occupation: input.occupation,
      ...(input.callback ? { callback: input.callback } : {}),
    },
  });
}
