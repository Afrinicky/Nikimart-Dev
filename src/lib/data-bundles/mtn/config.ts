import "server-only";
import { getDataSettings } from "@/lib/data-bundles/settings";
import { normaliseMsisdnFormat, toMtnMsisdn, type MsisdnFormat } from "@/lib/data-bundles/mtn/msisdn";
import { parseProductMapping, type ProductMapping } from "@/lib/data-bundles/mtn/products";

/**
 * The MTN integration's configuration, as an admin left it on the Developer
 * tab.
 *
 * Everything the MTN route needs is stored, not deployed: no environment
 * variable, no redeploy, no second place to look. That is a deliberate
 * trade — a secret in a settings row rather than in the platform's own secret
 * store — and it is the right one here because the people who will operate
 * this integration are the people with the admin console, not the people with
 * the deployment dashboard. The secret is write-only in the UI and is never
 * rendered back to a browser or written to a log.
 *
 * `isReady` is the only thing callers should ask before using the route. It is
 * false until every value a transfer cannot be built without is present, so a
 * half-filled form fails closed instead of sending MTN something malformed on
 * a customer's paid order.
 */

export interface MtnConfig {
  /** True when the admin has switched MTN bundles onto this route. */
  routeEnabled: boolean;
  /** True when the route is switched on AND everything it needs is filled in. */
  isReady: boolean;
  /** What is missing, for the console to show. Empty when ready. */
  missing: string[];

  base: string;
  clientId: string;
  clientSecret: string;
  /** The sender line, already in the format this account expects. */
  senderMsisdn: string;
  /** The sender line as typed, for display. */
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

/** The fields a transfer genuinely cannot be built without. */
const REQUIRED: Array<[keyof MtnConfig, string]> = [
  ["clientId", "Consumer key"],
  ["clientSecret", "Consumer secret"],
  ["senderMsisdn", "Sender MSISDN"],
  ["targetSystem", "Target system"],
];

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

/** True unless the value is an explicit off, matching the rest of the settings. */
function on(raw: string): boolean {
  return !["0", "off", "false", "no"].includes(raw.trim().toLowerCase());
}

/**
 * Build the config from a settings record.
 *
 * Split out from `getMtnConfig` so a caller that has just *written* settings
 * can judge the result without reading them back. That read is not reliably
 * fresh — `getDataSettings` is memoised per request and cached across them, so
 * a save followed by a re-read inside one server action can legitimately
 * return the values from before the save. Validating the route switch against
 * a stale read would let it be thrown while a required field was still empty.
 */
export function buildMtnConfig(settings: Record<string, string | undefined>): MtnConfig {
  const msisdnFormat = normaliseMsisdnFormat(settings.mtnMsisdnFormat);
  const senderLocal = trimmed(settings.mtnSenderMsisdn);

  const config: MtnConfig = {
    routeEnabled: trimmed(settings.dataRouteMTN).toUpperCase() === "MTN",
    isReady: false,
    missing: [],

    base: (trimmed(settings.mtnApiBase) || "https://api.mtn.com/v1").replace(/\/+$/, ""),
    clientId: trimmed(settings.mtnClientId),
    clientSecret: trimmed(settings.mtnClientSecret),
    // Converted once, here, so nothing downstream has to remember which form
    // this account wants. An unreadable number leaves it empty, which is then
    // reported as missing rather than sent as nonsense.
    senderMsisdn: toMtnMsisdn(senderLocal, msisdnFormat) ?? "",
    senderLocal,
    pin: trimmed(settings.mtnSenderPin),
    targetSystem: trimmed(settings.mtnTargetSystem),
    originChannelId: trimmed(settings.mtnOriginChannelId),
    countryCode: trimmed(settings.mtnCountryCode) || "GH",
    networkParam: trimmed(settings.mtnNetworkParam),
    transferType: trimmed(settings.mtnTransferType) || "DATA",
    msisdnFormat,
    agentId: trimmed(settings.mtnAgentId),
    callbackEnabled: on(settings.mtnCallbackEnabled ?? "1"),
    products: parseProductMapping(settings.mtnProductCodes),
  };

  config.missing = REQUIRED.filter(([key]) => !config[key]).map(([, label]) => label);
  // A sender number that could not be read as a Ghana mobile number is worth
  // saying out loud, because "Sender MSISDN" alone would read as "you left it
  // blank" when the real fault is that what is there cannot be dialled.
  if (senderLocal !== "" && config.senderMsisdn === "") {
    config.missing = config.missing.map((m) =>
      m === "Sender MSISDN" ? "Sender MSISDN (not a Ghana mobile number)" : m,
    );
  }
  config.isReady = config.routeEnabled && config.missing.length === 0;

  return config;
}

/** The MTN configuration as it is stored right now. */
export async function getMtnConfig(): Promise<MtnConfig> {
  return buildMtnConfig(await getDataSettings());
}

/**
 * Whether the MTN route is configured at all, regardless of the switch.
 *
 * The console uses this to tell "not set up" apart from "set up and turned
 * off", which are two different things to an admin looking at a dark route.
 */
export async function isMtnConfigured(): Promise<boolean> {
  const config = await getMtnConfig();
  return config.missing.length === 0;
}
