import "server-only";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { normaliseMsisdnFormat, toMtnMsisdn, type MsisdnFormat } from "@/lib/data-bundles/mtn/msisdn";
import { parseProductMapping, type ProductMapping } from "@/lib/data-bundles/mtn/products";

/**
 * The MTN integration's configuration, from two places on purpose.
 *
 *   The environment   every credential and per-account value MTN issues. They
 *                     are secrets or near enough, they are set once when the
 *                     account is provisioned, and they belong in the
 *                     platform's own secret store — not in a settings table
 *                     that is inside every database snapshot the console can
 *                     download.
 *
 *   The settings      the two things that have to be changeable *now*: the
 *                     route switch, because turning the route off is how you
 *                     stop it and that cannot wait on a deploy, and the
 *                     product codes, because a bundle size added to the
 *                     ladder needs a line against it the same afternoon.
 *
 * The split is not arbitrary: it is "what a deploy may gate" against "what
 * must never be gated by one".
 *
 * `isReady` is the only thing callers should ask before using the route. It is
 * false until every value a transfer cannot be built without is present, so a
 * partly-provisioned environment fails closed instead of sending MTN something
 * malformed on a customer's paid order.
 */

export interface MtnConfig {
  /** True when the admin has switched MTN bundles onto this route. */
  routeEnabled: boolean;
  /** True when the route is switched on AND everything it needs is present. */
  isReady: boolean;
  /** What is missing, for the console to show. Empty when ready. */
  missing: string[];

  base: string;
  clientId: string;
  clientSecret: string;
  /** The sender line, already in the format this account expects. */
  senderMsisdn: string;
  /** The sender line as the environment gives it, for display. */
  senderLocal: string;
  pin: string;
  targetSystem: string;
  originChannelId: string;
  countryCode: string;
  networkParam: string;
  transferType: string;
  msisdnFormat: MsisdnFormat;
  agentId: string;
  callbackEnabled: boolean;
  products: ProductMapping;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** True unless the value is an explicit off, matching the rest of the settings. */
function on(raw: string, fallback: boolean): boolean {
  if (raw === "") return fallback;
  return !["0", "off", "false", "no"].includes(raw.toLowerCase());
}

/**
 * Every environment variable this integration reads, in one list.
 *
 * It is the single definition of what has to be set, and it is what the
 * console's status panel renders — so the page cannot drift out of step with
 * what the code actually requires, which is the usual fate of a documented
 * list of settings kept somewhere else.
 *
 * Only `set` is ever exposed to a browser. The values themselves do not leave
 * this module.
 */
export const MTN_ENV_VARS = [
  { name: "MTN_CLIENT_ID", label: "Consumer key", required: true },
  { name: "MTN_CLIENT_SECRET", label: "Consumer secret", required: true },
  { name: "MTN_SENDER_MSISDN", label: "Sender number", required: true },
  { name: "MTN_TARGET_SYSTEM", label: "Target system", required: true },
  { name: "MTN_ORIGIN_CHANNEL_ID", label: "Origin channel ID", required: false },
  { name: "MTN_SENDER_PIN", label: "Line PIN", required: false },
  { name: "MTN_COUNTRY_CODE", label: "Country code", required: false },
  { name: "MTN_NETWORK_PARAM", label: "Network parameter", required: false },
  { name: "MTN_TRANSFER_TYPE", label: "Transfer type", required: false },
  { name: "MTN_MSISDN_FORMAT", label: "Number format", required: false },
  { name: "MTN_AGENT_ID", label: "Agent ID", required: false },
  { name: "MTN_API_BASE", label: "API base URL", required: false },
  { name: "MTN_CALLBACK_ENABLED", label: "Status callbacks", required: false },
] as const;

export interface MtnEnvVarStatus {
  name: string;
  label: string;
  required: boolean;
  /** Whether a value is present. Never the value. */
  set: boolean;
  /** What the code falls back to when it is not set, where there is one. */
  fallback?: string;
}

const FALLBACKS: Record<string, string> = {
  MTN_API_BASE: "https://api.mtn.com/v1",
  MTN_COUNTRY_CODE: "GH",
  MTN_TRANSFER_TYPE: "DATA",
  MTN_MSISDN_FORMAT: "INTERNATIONAL",
  MTN_CALLBACK_ENABLED: "on",
};

/** Which variables are set, for the console. Values never included. */
export function mtnEnvStatus(): MtnEnvVarStatus[] {
  return MTN_ENV_VARS.map((v) => ({
    name: v.name,
    label: v.label,
    required: v.required,
    set: env(v.name) !== "",
    fallback: FALLBACKS[v.name],
  }));
}

/** The fields a transfer genuinely cannot be built without. */
const REQUIRED: Array<[keyof MtnConfig, string]> = [
  ["clientId", "MTN_CLIENT_ID"],
  ["clientSecret", "MTN_CLIENT_SECRET"],
  ["senderMsisdn", "MTN_SENDER_MSISDN"],
  ["targetSystem", "MTN_TARGET_SYSTEM"],
];

/**
 * Build the config from the environment plus the two stored settings.
 *
 * Takes the settings rather than reading them, so a caller that has just
 * *written* one can judge the result without reading it back. That read is not
 * reliably fresh — `getDataSettings` is memoised per request and cached across
 * them, so a save followed by a re-read inside one server action can
 * legitimately return the values from before the save. Validating the route
 * switch against a stale read would let it be thrown while the product list
 * was still empty.
 */
export function buildMtnConfig(settings: {
  dataRouteMTN?: string;
  mtnProductCodes?: string;
}): MtnConfig {
  const msisdnFormat = normaliseMsisdnFormat(env("MTN_MSISDN_FORMAT"));
  const senderLocal = env("MTN_SENDER_MSISDN");

  const config: MtnConfig = {
    routeEnabled: (settings.dataRouteMTN ?? "").trim().toUpperCase() === "MTN",
    isReady: false,
    missing: [],

    base: (env("MTN_API_BASE") || "https://api.mtn.com/v1").replace(/\/+$/, ""),
    clientId: env("MTN_CLIENT_ID"),
    clientSecret: env("MTN_CLIENT_SECRET"),
    // Converted once, here, so nothing downstream has to remember which form
    // this account wants. An unreadable number leaves it empty, which is then
    // reported as missing rather than sent as nonsense.
    senderMsisdn: toMtnMsisdn(senderLocal, msisdnFormat) ?? "",
    senderLocal,
    pin: env("MTN_SENDER_PIN"),
    targetSystem: env("MTN_TARGET_SYSTEM"),
    originChannelId: env("MTN_ORIGIN_CHANNEL_ID"),
    countryCode: env("MTN_COUNTRY_CODE") || "GH",
    networkParam: env("MTN_NETWORK_PARAM"),
    transferType: env("MTN_TRANSFER_TYPE") || "DATA",
    msisdnFormat,
    agentId: env("MTN_AGENT_ID"),
    callbackEnabled: on(env("MTN_CALLBACK_ENABLED"), true),
    products: parseProductMapping(settings.mtnProductCodes),
  };

  config.missing = REQUIRED.filter(([key]) => !config[key]).map(([, name]) => name);
  // A sender number that could not be read as a Ghana mobile number is worth
  // saying out loud, because the variable's name alone would read as "you left
  // it blank" when the real fault is that what is there cannot be dialled.
  if (senderLocal !== "" && config.senderMsisdn === "") {
    config.missing = config.missing.map((m) =>
      m === "MTN_SENDER_MSISDN" ? "MTN_SENDER_MSISDN (not a Ghana mobile number)" : m,
    );
  }
  config.isReady = config.routeEnabled && config.missing.length === 0;

  return config;
}

/** The MTN configuration as it stands right now. */
export async function getMtnConfig(): Promise<MtnConfig> {
  return buildMtnConfig(await getDataSettings());
}

/**
 * Whether the environment is provisioned, regardless of the switch.
 *
 * The console uses this to tell "not set up" apart from "set up and turned
 * off", which are two different things to an admin looking at a dark route.
 */
export async function isMtnConfigured(): Promise<boolean> {
  return (await getMtnConfig()).missing.length === 0;
}
