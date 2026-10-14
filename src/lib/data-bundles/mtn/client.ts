import "server-only";
import type { MtnConfig } from "@/lib/data-bundles/mtn/config";
import { mtnMessage } from "@/lib/data-bundles/mtn/status";

/**
 * MTN Customer Transfer (MADAPI), server-only.
 *
 *   POST /customers/{senderMsisdn}     transfer data to another subscriber
 *   GET  /customers/transactionStatus  what became of one transfer
 *
 * Authentication is OAuth2 client credentials: the app's Consumer key and
 * secret are exchanged for a bearer token, which is then cached for the life
 * of the process (see `tokenFor`). Both secrets stay in this layer — nothing
 * above it sees them, no route echoes them, and the error paths below log the
 * method and path but never the Authorization header.
 *
 * Three things differ from the reseller API next door, and each is the kind of
 * difference that produces a confident, wrong integration:
 *
 *   • The correlation id is *ours*. The reseller hands back an order id;
 *     MADAPI takes a `transactionId` we generate and answers about it later.
 *     That makes idempotency ours to get right — see `transferDataBundle`.
 *   • Acceptance and outcome are separate fields, read together in
 *     mtn/status.ts rather than here.
 *   • A transfer moves data out of a real subscriber line. There is no
 *     "balance" endpoint and no order to cancel; what there is, is a line that
 *     can run dry mid-sale.
 *
 * Like the reseller client, nothing here throws: every failure comes back as a
 * result, so an MTN outage is a failed order an admin can retry rather than a
 * 500 in front of a buyer who has already paid.
 */

const TIMEOUT_MS = 20_000;
/** Ask for a new token this long before the current one actually expires. */
const TOKEN_SKEW_MS = 60_000;
/** Used when MTN does not say how long a token lasts. */
const TOKEN_FALLBACK_TTL_MS = 50 * 60_000;

export interface MtnResult<T> {
  ok: boolean;
  /** MTN's message, or our own description of the failure. */
  message: string;
  /** HTTP status, or 0 when the call never completed. */
  status: number;
  payload: T | null;
  /** The transactionId this call was made under, where there was one. */
  transactionId?: string;
}

/** The transfer/status envelope, as the specification describes it. */
export interface MtnTransferEnvelope {
  statusCode?: string;
  statusMessage?: string;
  supportMessage?: string;
  transactionId?: string;
  sequenceNo?: string;
  downstreamStatusCode?: number | string;
  data?: {
    description?: string;
    valueCharged?: number;
    unit?: string;
    productName?: string;
    productId?: string;
    productType?: string;
    productCode?: string;
    agentId?: string;
    notification?: string;
    localTransactionId?: string;
    transactionState?: string;
    customerId?: string;
    receiverMsisdn?: string;
    accountBalances?: Array<{
      amount?: { value?: string; currencyCode?: string };
      balanceType?: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * One cached token per client id.
 *
 * Keyed rather than single because the credentials can be edited in the
 * console at any moment, and a token minted under the old key must not be
 * handed to the new one — the symptom would be an intermittent 401 that
 * "fixes itself" on the next deploy, which is a miserable thing to chase.
 */
const tokens = new Map<string, { token: string; expiresAt: number }>();

/** Drop a cached token — called when the credentials are saved or tested. */
export function forgetMtnToken(clientId?: string): void {
  if (clientId) tokens.delete(clientId);
  else tokens.clear();
}

function readToken(json: unknown): { token: string; ttlMs: number } | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const token =
    typeof record.access_token === "string"
      ? record.access_token
      : typeof record.accessToken === "string"
        ? record.accessToken
        : null;
  if (!token || !token.trim()) return null;

  const expiresIn = Number(record.expires_in ?? record.expiresIn);
  const ttlMs =
    Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : TOKEN_FALLBACK_TTL_MS;
  return { token: token.trim(), ttlMs };
}

/**
 * A bearer token for this account, from cache where possible.
 *
 * The credentials go in the Basic authorization header, which is the form
 * MADAPI's token endpoint documents; `grant_type=client_credentials` is the
 * body. Nothing about either is logged.
 */
/**
 * What a rejection actually said.
 *
 * The gateway in front of MADAPI reports a bad token request in at least
 * three shapes — `error` / `error_description` from OAuth2, `fault.faultstring`
 * from Apigee, and a plain `message` — and it was being reduced to "HTTP 400",
 * which says only that something was wrong with a request we cannot see. The
 * difference between "unsupported grant type" and "invalid client" is the
 * whole diagnosis, so every shape is read and the raw body is the last resort.
 */
function errorDetail(json: unknown, text: string, status: number): string {
  if (typeof json === "object" && json !== null) {
    const record = json as Record<string, unknown>;
    const fault = record.fault as Record<string, unknown> | undefined;
    const candidates = [
      record.error_description,
      record.message,
      record.statusMessage,
      fault?.faultstring,
      record.error,
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return `${value.trim()} (HTTP ${status})`;
    }
  }
  const body = text.trim().slice(0, 200);
  return body ? `HTTP ${status}: ${body}` : `HTTP ${status}`;
}

/**
 * The ways a client-credentials token is asked for, in the order they are
 * tried.
 *
 * There is a standard for this and then there is what a given gateway
 * actually accepts. MADAPI sits behind Apigee, whose token endpoint commonly
 * wants `grant_type` as a *query parameter* rather than in the body — and a
 * request that puts it in the body comes back as a bare HTTP 400, which is
 * indistinguishable from a wrong secret unless you already know to look.
 *
 * Rather than pick one and leave an operator guessing, all three standard
 * dialects are tried in turn and the first that yields a token wins. Each is a
 * legitimate reading of the OAuth2 client-credentials grant; none of them can
 * do anything but ask for a token.
 *
 * The winner is remembered per client id, so this costs one extra round trip
 * once rather than on every call.
 */
type TokenDialect = "basic-body" | "basic-query" | "body-credentials";

const DIALECTS: readonly TokenDialect[] = ["basic-body", "basic-query", "body-credentials"];

const dialectInUse = new Map<string, TokenDialect>();

export function describeDialect(dialect: TokenDialect): string {
  if (dialect === "basic-query") return "Basic auth with grant_type in the query";
  if (dialect === "body-credentials") return "credentials in the body";
  return "Basic auth with grant_type in the body";
}

function tokenRequest(
  config: MtnConfig,
  dialect: TokenDialect,
): { url: string; headers: Record<string, string>; body: string } {
  const base = `${config.base}/oauth/access_token`;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const form = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (dialect === "basic-query") {
    return {
      url: `${base}?grant_type=client_credentials`,
      headers: { Authorization: `Basic ${basic}`, ...form },
      body: "",
    };
  }
  if (dialect === "body-credentials") {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    return { url: base, headers: { ...form }, body: body.toString() };
  }
  return {
    url: base,
    headers: { Authorization: `Basic ${basic}`, ...form },
    body: "grant_type=client_credentials",
  };
}

async function requestToken(
  config: MtnConfig,
  dialect: TokenDialect,
): Promise<{ token: string; ttlMs: number } | { error: string; status: number }> {
  const { url, headers, body } = tokenRequest(config, dialect);
  const res = await fetch(url, {
    method: "POST",
    headers,
    // A dialect that carries everything in the query sends no body at all;
    // an empty string would still set Content-Length: 0, which some gateways
    // reject alongside a form content type.
    ...(body === "" ? {} : { body }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — errorDetail keeps it as the message.
  }

  const read = readToken(json);
  if (!res.ok || !read) {
    return { error: errorDetail(json, text, res.status), status: res.status };
  }
  return read;
}

export async function mtnToken(config: MtnConfig): Promise<MtnResult<string>> {
  if (!config.clientId || !config.clientSecret) {
    return { ok: false, message: "MTN credentials are not set.", status: 0, payload: null };
  }

  const cached = tokens.get(config.clientId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, message: "OK", status: 200, payload: cached.token };
  }

  // The dialect that worked last time first, then the rest.
  const known = dialectInUse.get(config.clientId);
  const order = known ? [known, ...DIALECTS.filter((d) => d !== known)] : DIALECTS;

  const failures: string[] = [];
  let lastStatus = 0;

  for (const dialect of order) {
    let result;
    try {
      result = await requestToken(config, dialect);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[data-bundles] MTN token request failed: ${reason}`);
      return { ok: false, message: "Could not reach MTN.", status: 0, payload: null };
    }

    if ("token" in result) {
      dialectInUse.set(config.clientId, dialect);
      tokens.set(config.clientId, {
        token: result.token,
        expiresAt: Date.now() + Math.max(result.ttlMs - TOKEN_SKEW_MS, 30_000),
      });
      return { ok: true, message: "OK", status: 200, payload: result.token };
    }

    failures.push(`${describeDialect(dialect)} — ${result.error}`);
    lastStatus = result.status;

    // 401 means the gateway understood the request and rejected the
    // credentials. Trying another way of phrasing the same wrong secret only
    // produces the same answer, and repeated failed sign-ins are their own
    // problem on somebody else's system.
    if (result.status === 401) break;
  }

  // A stored value with a stray newline from a copy-paste is the single most
  // common cause of a token request that is well-formed and still refused, and
  // it is invisible in every dashboard. Worth saying before the detail.
  return {
    ok: false,
    message: `MTN would not issue a token. Check the key and secret for a stray space or line break, then: ${failures.join(" · ")}`,
    status: lastStatus,
    payload: null,
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * Headers, per endpoint — and they are genuinely different.
 *
 * The transfer takes `transactionId`, `x-country-code` and
 * `x-origin-channelid`, and carries `targetSystem` in the *body*. The status
 * read takes `targetSystem` and `x-country-code` as headers and defines
 * neither of the other two. Sending the union to both looks harmless and is
 * the kind of thing an API gateway rejects for an undeclared header, so each
 * call builds only what its own operation declares.
 */
function baseHeaders(token: string, countryCode: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (countryCode) headers["x-country-code"] = countryCode;
  return headers;
}

function transferHeaders(config: MtnConfig, token: string, transactionId: string) {
  const headers = baseHeaders(token, config.countryCode);
  if (config.originChannelId) headers["x-origin-channelid"] = config.originChannelId;
  if (transactionId) headers.transactionId = transactionId;
  return headers;
}

function statusHeaders(config: MtnConfig, token: string) {
  const headers = baseHeaders(token, config.countryCode);
  if (config.targetSystem) headers.targetSystem = config.targetSystem;
  return headers;
}

/**
 * Turn a reply into a result. A 2xx with a rejecting `statusCode` is still a
 * failure — the HTTP call worked, the transfer did not — which is the single
 * easiest thing to get wrong against this API.
 */
function envelopeResult(
  res: Response,
  json: MtnTransferEnvelope | null,
  text: string,
  transactionId?: string,
): MtnResult<MtnTransferEnvelope> {
  const message = json
    ? mtnMessage({
        statusCode: json.statusCode,
        statusMessage: json.statusMessage,
        supportMessage: json.supportMessage,
        downstreamStatusCode: json.downstreamStatusCode,
        transactionState: json.data?.transactionState,
      })
    : `MTN returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;

  return {
    ok: res.ok && json !== null,
    message,
    status: res.status,
    payload: json,
    transactionId: json?.transactionId ?? transactionId,
  };
}

export interface TransferInput {
  /** Local Ghana number of the buyer's recipient — converted here. */
  receiverMsisdn: string;
  /** The MTN product code for the bundle being sent. */
  productCode: string;
  /** Our own correlation id. MTN answers about this later. */
  transactionId: string;
  /** Absolute URL MTN calls as the transfer progresses. */
  callbackUrl?: string;
}

/**
 * Transfer one bundle.
 *
 * `transactionId` is supplied by the caller and must be derived from the order
 * — never generated here. That is what makes a retry safe: the same order
 * presents the same id, so a transfer MTN already has is recognisable as the
 * one it already has rather than bought a second time.
 */
export async function transferDataBundle(
  config: MtnConfig,
  input: TransferInput,
): Promise<MtnResult<MtnTransferEnvelope>> {
  const auth = await mtnToken(config);
  if (!auth.ok || !auth.payload) {
    return { ok: false, message: auth.message, status: auth.status, payload: null };
  }

  const url = new URL(`${config.base}/customers/${encodeURIComponent(config.senderMsisdn)}`);
  if (config.networkParam) url.searchParams.set("network", config.networkParam);

  const body: Record<string, unknown> = {
    receiverMsisdn: input.receiverMsisdn,
    targetSystem: config.targetSystem,
    type: config.transferType,
    productCode: input.productCode,
  };
  // Each of these is omitted rather than sent empty: an empty `pin` is not the
  // same as no pin, and an account that does not use one rejects the field.
  if (config.agentId) body.agentId = config.agentId;
  if (config.pin) body.pin = config.pin;
  if (input.callbackUrl) body.callbackUrl = input.callbackUrl;
  // The specification's remaining optional fields. Unset on most accounts, and
  // then absent from the request rather than sent as an empty string or a zero
  // — which for an int32 field would be a real value, not a blank.
  if (config.paysrc) body.paysrc = config.paysrc;
  if (config.srcAccountType !== null) body.srcAccountType = config.srcAccountType;
  if (config.dstAccountType !== null) body.dstAccountType = config.dstAccountType;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...transferHeaders(config, auth.payload, input.transactionId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text().catch(() => "");
    let json: MtnTransferEnvelope | null = null;
    try {
      json = text ? (JSON.parse(text) as MtnTransferEnvelope) : null;
    } catch {
      // Keep the raw body in the message instead.
    }
    return envelopeResult(res, json, text, input.transactionId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // No secrets, no MSISDNs — the transaction id is enough to find it again.
    console.error(`[data-bundles] MTN transfer ${input.transactionId} failed: ${reason}`);
    return {
      ok: false,
      message: "Could not reach MTN.",
      status: 0,
      payload: null,
      transactionId: input.transactionId,
    };
  }
}

/** What became of one transfer, by the transactionId we sent with it. */
export async function transferStatus(
  config: MtnConfig,
  transactionId: string,
): Promise<MtnResult<MtnTransferEnvelope>> {
  const auth = await mtnToken(config);
  if (!auth.ok || !auth.payload) {
    return { ok: false, message: auth.message, status: auth.status, payload: null };
  }

  const url = new URL(`${config.base}/customers/transactionStatus`);
  url.searchParams.set("transactionId", transactionId);
  if (config.networkParam) url.searchParams.set("network", config.networkParam);
  if (config.operation) url.searchParams.set("operation", config.operation);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: statusHeaders(config, auth.payload),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text().catch(() => "");
    let json: MtnTransferEnvelope | null = null;
    try {
      json = text ? (JSON.parse(text) as MtnTransferEnvelope) : null;
    } catch {
      // as above
    }
    return envelopeResult(res, json, text, transactionId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[data-bundles] MTN status ${transactionId} failed: ${reason}`);
    return { ok: false, message: "Could not reach MTN.", status: 0, payload: null, transactionId };
  }
}

/**
 * Try a `targetSystem` value without transferring anything.
 *
 * `targetSystem` is required on a transfer and MTN publishes no list of valid
 * values — not in the specification, not on the product page, not in the
 * portal's own sample, where the field sits blank. It is issued per account,
 * and the only way to learn it has been to ask MTN and wait.
 *
 * But the *status read* takes the same `targetSystem` as a header, and asking
 * it about a transaction id that was never used cannot transfer data, cannot
 * spend the line's balance and cannot touch an order. So it is safe to call
 * with any id at all — and the reply distinguishes the two failures that
 * matter: a rejected `targetSystem` is an error about the value itself, while
 * a transaction that simply does not exist means MTN accepted the value and
 * looked for the transaction.
 *
 * That turns an unknown into something testable: set a candidate, press the
 * button, read which kind of "no" comes back.
 *
 * It is a probe, not a proof. MTN could accept a value here and still reject
 * it on a transfer. It is strictly better than guessing on a customer's paid
 * order, which is the alternative.
 */
export async function probeTargetSystem(
  config: MtnConfig,
): Promise<{ ok: boolean; message: string }> {
  if (!config.targetSystem) {
    return { ok: false, message: "No target system is set." };
  }

  // An id that cannot belong to a real transfer: ours are derived from an
  // order reference and never look like this.
  const res = await transferStatus(config, `PROBE${Date.now().toString(36).toUpperCase()}`);

  // Reaching MTN at all is most of the answer. A 400 or 403 naming the target
  // system is a rejection of the value; anything else means the value got far
  // enough for MTN to go looking for a transaction that was never there.
  const says = `${res.message} ${res.payload?.statusMessage ?? ""}`.toLowerCase();
  const rejected =
    (res.status === 400 || res.status === 403) &&
    /target\s*system|invalid|not\s*supported|unknown/.test(says);

  if (res.status === 0) {
    return { ok: false, message: res.message };
  }
  if (res.status === 401) {
    return { ok: false, message: "MTN rejected the credentials, so the target system was never reached." };
  }
  if (rejected) {
    return {
      ok: false,
      message: `MTN did not accept "${config.targetSystem}": ${res.message}`,
    };
  }
  return {
    ok: true,
    message: `MTN accepted "${config.targetSystem}" and looked for the transaction (it replied: ${res.message}). That is the expected answer for an id that was never used.`,
  };
}

/**
 * Prove the credentials work, without transferring anything.
 *
 * The console needs a way to answer "are these keys right?" that cannot
 * possibly spend money or send data to a stranger, and a token request is
 * exactly that: it authenticates and does nothing else. The cached token is
 * dropped first so a test after an edit tests what was just typed rather than
 * what was working an hour ago.
 */
export async function testMtnCredentials(config: MtnConfig): Promise<MtnResult<string>> {
  forgetMtnToken(config.clientId);
  return mtnToken(config);
}
