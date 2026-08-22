// Ghana mobile networks we resell data on, and the shape of their numbers.
// Pure module (no server-only imports) so the storefront form, the server
// actions, and the admin console all validate against exactly the same rules.

export const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO_ISHARE", "AIRTELTIGO_BIGTIME"] as const;

export type Network = (typeof NETWORKS)[number];

export interface NetworkInfo {
  value: Network;
  /** Full name as shown on the storefront tab. */
  label: string;
  /** Compact name for tight spaces (chips, tables, SMS). */
  short: string;
  /** One-line description of what the buyer is getting. */
  blurb: string;
  /** Brand colours for the tab/card gradient. */
  accentFrom: string;
  accentTo: string;
  /** Text colour that stays readable on the accent gradient. */
  onAccent: string;
  /** Local prefixes (leading 0) that belong to this network. */
  prefixes: string[];
}

export const NETWORK_INFO: Record<Network, NetworkInfo> = {
  MTN: {
    value: "MTN",
    label: "MTN",
    short: "MTN",
    blurb: "MTN non-expiry data, credited straight to the number you enter.",
    accentFrom: "#ffcc00",
    accentTo: "#c79000",
    onAccent: "#111827",
    prefixes: ["024", "025", "053", "054", "055", "059"],
  },
  TELECEL: {
    value: "TELECEL",
    label: "Telecel",
    short: "Telecel",
    blurb: "Telecel (formerly Vodafone) data bundles with no expiry.",
    accentFrom: "#e2231a",
    accentTo: "#8c0f0a",
    onAccent: "#ffffff",
    prefixes: ["020", "050"],
  },
  AIRTELTIGO_ISHARE: {
    value: "AIRTELTIGO_ISHARE",
    label: "AirtelTigo iShare",
    short: "AT iShare",
    blurb: "AirtelTigo iShare bundles — shareable, non-expiry data.",
    accentFrom: "#0a5eb0",
    accentTo: "#062f59",
    onAccent: "#ffffff",
    prefixes: ["026", "027", "056", "057"],
  },
  AIRTELTIGO_BIGTIME: {
    value: "AIRTELTIGO_BIGTIME",
    label: "AirtelTigo BigTime",
    short: "AT BigTime",
    blurb: "AirtelTigo BigTime — large-volume data at the lowest rate per GB.",
    accentFrom: "#1f8a70",
    accentTo: "#0b3d31",
    onAccent: "#ffffff",
    prefixes: ["026", "027", "056", "057"],
  },
};

export const NETWORK_LIST: NetworkInfo[] = NETWORKS.map((n) => NETWORK_INFO[n]);

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value);
}

export function networkLabel(value: string): string {
  return isNetwork(value) ? NETWORK_INFO[value].label : value;
}

/**
 * Normalise a Ghana number to the 10-digit local form (0XXXXXXXXX) the provider
 * expects — it explicitly rejects a +233/233 prefix. Returns null if the input
 * can't be a Ghana mobile number.
 */
export function toLocalGhPhone(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  let local: string;
  if (digits.length === 12 && digits.startsWith("233")) local = `0${digits.slice(3)}`;
  else if (digits.length === 10 && digits.startsWith("0")) local = digits;
  else if (digits.length === 9) local = `0${digits}`;
  else return null;
  return /^0\d{9}$/.test(local) ? local : null;
}

/** The network a local number belongs to, or null when the prefix is unknown. */
export function networkForPhone(localPhone: string): Network | null {
  const prefix = localPhone.slice(0, 3);
  if (NETWORK_INFO.MTN.prefixes.includes(prefix)) return "MTN";
  if (NETWORK_INFO.TELECEL.prefixes.includes(prefix)) return "TELECEL";
  if (NETWORK_INFO.AIRTELTIGO_ISHARE.prefixes.includes(prefix)) return "AIRTELTIGO_ISHARE";
  return null;
}

/**
 * True when `localPhone` can receive data on `network`. iShare and BigTime run
 * on the same prefixes, so both accept any AirtelTigo number.
 */
export function phoneMatchesNetwork(localPhone: string, network: Network): boolean {
  return NETWORK_INFO[network].prefixes.includes(localPhone.slice(0, 3));
}

/** "5GB", "1.5GB" — the size as buyers read it. */
export function bundleLabel(sizeGb: number): string {
  return `${Number.isInteger(sizeGb) ? sizeGb : sizeGb.toFixed(1)}GB`;
}

// Order statuses a bundle purchase moves through, and how they read in the UI.
export const DATA_ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "completed",
  "failed",
  "refunded",
] as const;

export type DataOrderStatus = (typeof DATA_ORDER_STATUSES)[number];

export const DATA_STATUS_LABELS: Record<DataOrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid — queued",
  processing: "Sending data",
  completed: "Delivered",
  failed: "Failed",
  refunded: "Refunded",
};

export const DATA_STATUS_TONES: Record<DataOrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  paid: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  processing: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  completed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  failed: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
  refunded: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
};

export function isDataOrderStatus(value: unknown): value is DataOrderStatus {
  return typeof value === "string" && (DATA_ORDER_STATUSES as readonly string[]).includes(value);
}

/** Map a provider status string onto ours. Unknown values stay "processing". */
export function mapProviderStatus(providerStatus: string | null | undefined): DataOrderStatus {
  switch ((providerStatus ?? "").trim().toUpperCase()) {
    case "COMPLETED":
    case "SUCCESS":
    case "SUCCESSFUL":
    case "DELIVERED":
      return "completed";
    case "FAILED":
    case "CANCELLED":
    case "CANCELED":
    case "REJECTED":
      return "failed";
    case "REFUNDED":
      return "refunded";
    default:
      return "processing";
  }
}
