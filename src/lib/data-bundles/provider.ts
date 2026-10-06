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

// ---------------------------------------------------------------------------
// The price list
// ---------------------------------------------------------------------------

/**
 * What each bundle costs us, read from the provider's own package list.
 *
 * There are two ways in, and an account normally has one of them:
 *
 *   api        The API key already used for orders, against the `/api` package
 *              endpoints. Nothing to sign in to, nothing to expire, and no
 *              second secret to keep — so it is tried first.
 *   dashboard  The agent dashboard's own session, on `/packages/agent/tier`:
 *              the tier this account actually buys at. It needs the dashboard
 *              login, and a dashboard set to send a one-time code on sign-in
 *              cannot be automated at all.
 *
 *     JUSTICE_AGENT_PHONE     the phone the agent dashboard is signed in with
 *     JUSTICE_AGENT_PASSWORD  its password
 *
 * Both are optional. With neither, the cost sync reports that it has no way to
 * read prices and nothing else changes — orders keep being fulfilled on the API
 * key exactly as before, and cost prices stay whatever an admin last typed.
 *
 * Note what none of this is used for: nothing here ever orders, transfers or
 * changes anything upstream. It reads a price list.
 */

/** Which read to use. "auto" tries the key, then the dashboard sign-in. */
export type PriceSource = "auto" | "api" | "dashboard";

const PRICE_SOURCE_KEYS: readonly PriceSource[] = ["auto", "api", "dashboard"];

/** Read a stored or posted value as a source. Anything else means "auto". */
export function normalisePriceSource(raw: string | null | undefined): PriceSource {
  const value = (raw ?? "").trim().toLowerCase();
  return (PRICE_SOURCE_KEYS as readonly string[]).includes(value) ? (value as PriceSource) : "auto";
}

export function priceSourceLabel(source: PriceSource | null): string {
  if (source === "api") return "the API key";
  if (source === "dashboard") return "the dashboard sign-in";
  return "the provider";
}

function agentCredentials(): { phoneNumber: string; password: string } | null {
  const phoneNumber = process.env.JUSTICE_AGENT_PHONE?.trim();
  const password = process.env.JUSTICE_AGENT_PASSWORD;
  if (!phoneNumber || !password) return null;
  return { phoneNumber, password };
}

/** True when the dashboard credentials are present and costs can be synced. */
export function isProviderDashboardConfigured(): boolean {
  return agentCredentials() !== null;
}

/**
 * The dashboard session, cached for the life of the process.
 *
 * A sync is a handful of page requests; signing in for each of them would turn
 * a daily job into a daily burst of failed-login alerts on somebody else's
 * system. The window is deliberately short — an hour — because a token we
 * cannot refresh is worse than one we re-fetch.
 */
let session: { token: string; expiresAt: number } | null = null;
const SESSION_TTL_MS = 60 * 60_000;

function tokenFrom(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value.includes(".") ? value : null;
  if (depth > 3 || typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["token", "accessToken", "access_token", "jwt", "authToken"]) {
    const found = record[key];
    if (typeof found === "string" && found.trim()) return found.trim();
  }
  for (const key of ["payload", "data", "user", "agent", "result"]) {
    const nested = tokenFrom(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

async function dashboardToken(): Promise<{ token: string | null; message: string }> {
  const creds = agentCredentials();
  if (!creds) {
    return { token: null, message: "No dashboard credentials (JUSTICE_AGENT_PHONE / JUSTICE_AGENT_PASSWORD)." };
  }
  if (session && session.expiresAt > Date.now()) {
    return { token: session.token, message: "OK" };
  }

  try {
    const res = await fetch(`${providerBase()}/auth/login-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(creds),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body; the message below still says what happened.
    }

    const token = tokenFrom(json);
    if (!token) {
      // The usual cause is a one-time code: the dashboard can be set to send an
      // OTP on sign-in, and a sign-in that needs a human cannot be automated.
      // Say so plainly rather than reporting "wrong password".
      const message =
        (typeof json === "object" && json !== null
          ? String((json as Record<string, unknown>).message ?? "")
          : "") || `Sign-in returned HTTP ${res.status}.`;
      return { token: null, message: `Could not sign in to the provider dashboard: ${message}` };
    }

    session = { token, expiresAt: Date.now() + SESSION_TTL_MS };
    return { token, message: "OK" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[data-bundles] provider dashboard sign-in failed: ${reason}`);
    return { token: null, message: "Could not reach the provider dashboard." };
  }
}

/** One package as the provider lists it. Sizes are theirs; we normalise later. */
export interface RawProviderPackage {
  network?: unknown;
  size?: unknown;
  price?: unknown;
  available?: unknown;
}

/** Pull however the list is wrapped — an array, or a page object around one. */
function rowsFrom(payload: unknown): RawProviderPackage[] {
  if (Array.isArray(payload)) return payload as RawProviderPackage[];
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "items", "packages", "results", "rows"]) {
    const value = record[key];
    if (Array.isArray(value)) return value as RawProviderPackage[];
  }
  return [];
}

const PAGE_SIZE = 100;
/** Enough for several times the whole ladder; a guard, not a limit. */
const MAX_PAGES = 10;

/**
 * The tier list first, the whole catalogue second.
 *
 * A tier endpoint answers "what does this cost *me*", which is the only price
 * worth writing onto a cost column; the catalogue is the fallback for an
 * account that has no tier of its own.
 */
const API_PACKAGE_PATHS = ["/api/packages/agent/tier", "/api/packages", "/api/package"] as const;
const DASHBOARD_PACKAGE_PATHS = ["/packages/agent/tier", "/packages"] as const;

/** A price list, and which of the two reads produced it. */
export interface PackageListing extends ProviderResult<RawProviderPackage[]> {
  source: "api" | "dashboard" | null;
}

/**
 * Walk a set of package endpoints until one of them lists something.
 *
 * Paged, because a catalogue runs to a few hundred rows and a provider that
 * caps a page at a hundred would otherwise hand us a third of the ladder and
 * look like it had answered. An endpoint that errors or lists nothing is not
 * reported on its own — the next path is tried, and only the last failure is
 * handed back, because a 404 on a path this account does not have is noise
 * rather than news.
 */
async function readPackagePages(
  paths: readonly string[],
  headers: Record<string, string>,
): Promise<ProviderResult<RawProviderPackage[]>> {
  let failed: ProviderResult<RawProviderPackage[]> | null = null;

  for (const path of paths) {
    const collected: RawProviderPackage[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      let rows: RawProviderPackage[] = [];
      try {
        const res = await fetch(`${providerBase()}${path}?page=${page}&pageSize=${PAGE_SIZE}`, {
          headers: { Accept: "application/json", ...headers },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await res.text().catch(() => "");
        let json: Envelope<unknown> | null = null;
        try {
          json = text ? (JSON.parse(text) as Envelope<unknown>) : null;
        } catch {
          // as elsewhere: keep the raw body for the message
        }
        if (!res.ok || json?.status === false) {
          failed = {
            ok: false,
            message: json?.message ?? `Provider returned HTTP ${res.status}`,
            status: res.status,
            payload: null,
          };
          break;
        }
        rows = rowsFrom(json?.payload ?? json);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Logged without the key or the token — the path is enough to diagnose.
        console.error(`[data-bundles] GET ${path} failed: ${reason}`);
        failed = { ok: false, message: "Could not reach the provider.", status: 0, payload: null };
        break;
      }

      collected.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }

    if (collected.length > 0) {
      return { ok: true, message: "OK", status: 200, payload: collected };
    }
  }

  return failed ?? { ok: false, message: "The provider returned no packages.", status: 200, payload: [] };
}

/** The price list on the order-taking API key — no sign-in, nothing to expire. */
export async function listProviderPackagesViaApi(): Promise<ProviderResult<RawProviderPackage[]>> {
  const key = providerKey();
  if (!key) {
    return { ok: false, message: "No provider API key (JUSTICE_API_KEY).", status: 0, payload: null };
  }
  return readPackagePages(API_PACKAGE_PATHS, { "X-API-Key": key });
}

/** The price list behind the agent dashboard's own session. */
export async function listProviderPackagesViaDashboard(): Promise<
  ProviderResult<RawProviderPackage[]>
> {
  const auth = await dashboardToken();
  if (!auth.token) return { ok: false, message: auth.message, status: 0, payload: null };
  return readPackagePages(DASHBOARD_PACKAGE_PATHS, { Authorization: `Bearer ${auth.token}` });
}

/**
 * Every package this account can buy, at the price it pays.
 *
 * On "auto" the API key is tried first and the dashboard sign-in is the
 * fallback, so a deployment that has only ever been given the key — which is
 * every deployment, since the key is what fulfils orders — can price itself
 * without a second secret. A source named outright is used on its own, so an
 * admin can prove which of the two is working rather than guess from a number
 * that did or did not move.
 */
export async function listProviderPackages(source: PriceSource = "auto"): Promise<PackageListing> {
  if (source === "api") {
    return { ...(await listProviderPackagesViaApi()), source: "api" };
  }
  if (source === "dashboard") {
    return { ...(await listProviderPackagesViaDashboard()), source: "dashboard" };
  }

  const api = await listProviderPackagesViaApi();
  if (api.ok && api.payload && api.payload.length > 0) return { ...api, source: "api" };

  const dashboard = await listProviderPackagesViaDashboard();
  if (dashboard.ok && dashboard.payload && dashboard.payload.length > 0) {
    return { ...dashboard, source: "dashboard" };
  }

  // Neither answered. Say so once, naming both, rather than blaming whichever
  // was asked last — the usual cause is that only one of the two is set up.
  return {
    ok: false,
    status: dashboard.status || api.status,
    payload: null,
    source: null,
    message: `API key: ${api.message} Dashboard sign-in: ${dashboard.message}`,
  };
}
