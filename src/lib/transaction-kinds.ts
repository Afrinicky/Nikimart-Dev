/**
 * What a money movement is, in one vocabulary for both consoles.
 *
 * The two businesses keep their own books — a bundle sale and a mall order
 * live in different databases and never appear on the same screen — but a
 * transaction list answers the same three questions either side: what kind of
 * movement was it, which way did the money go, and where can I go and look at
 * it. So the shape and the words are shared even though the rows never are.
 *
 * Pure module: a server read and a client filter both import it, so what is
 * offered and what is queried can never drift apart.
 */

/** Which way the money went, from Nickimart's point of view. */
export type Flow = "in" | "out" | "internal";

export interface TransactionKind {
  key: string;
  label: string;
  flow: Flow;
  /** The console it belongs to. "both" for a kind each side records. */
  scope: "data" | "retail";
}

export const TRANSACTION_KINDS: TransactionKind[] = [
  // --- Data bundles -------------------------------------------------------
  { key: "BUNDLE_ORDER", label: "Bundle sale", flow: "in", scope: "data" },
  { key: "AFA", label: "AFA registration", flow: "in", scope: "data" },
  { key: "WALLET_TOPUP", label: "Agent wallet top-up", flow: "in", scope: "data" },
  { key: "REGISTRATION_FEE", label: "Agent registration fee", flow: "in", scope: "data" },
  { key: "COMMISSION", label: "Agent commission", flow: "internal", scope: "data" },
  { key: "REFERRAL", label: "Referral earnings", flow: "internal", scope: "data" },
  { key: "ADJUSTMENT", label: "Balance adjustment", flow: "internal", scope: "data" },
  { key: "REFUND", label: "Refund", flow: "out", scope: "data" },
  { key: "WITHDRAWAL", label: "Agent payout", flow: "out", scope: "data" },
  // --- Retail -------------------------------------------------------------
  { key: "ORDER_PAYMENT", label: "Order payment", flow: "in", scope: "retail" },
  { key: "VENDOR_PAYOUT", label: "Shop payout", flow: "out", scope: "retail" },
  { key: "AFFILIATE_PAYOUT", label: "Affiliate payout", flow: "out", scope: "retail" },
];

export function kindsFor(scope: "data" | "retail"): TransactionKind[] {
  return TRANSACTION_KINDS.filter((k) => k.scope === scope);
}

/** The dropdown for one console: every kind it records, and "all". */
export function kindOptions(scope: "data" | "retail") {
  return [{ value: "all", label: "All kinds" }, ...kindsFor(scope).map((k) => ({ value: k.key, label: k.label }))];
}

export const FLOW_OPTIONS = [
  { value: "all", label: "Money in and out" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
  { value: "internal", label: "Moved inside the platform" },
];

export function transactionKind(key: string): TransactionKind | undefined {
  return TRANSACTION_KINDS.find((k) => k.key === key);
}

export function kindLabel(key: string): string {
  return transactionKind(key)?.label ?? key.replace(/_/g, " ").toLowerCase();
}

/**
 * Colour by direction rather than by kind.
 *
 * A transaction list is scanned for "did money come in or go out", and there
 * are a dozen kinds — colouring each one separately would be a dozen hues
 * nobody can hold in their head. Three directions, three tones, and the kind
 * is written out beside it.
 */
export function flowTone(flow: Flow): string {
  if (flow === "in") return "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30";
  if (flow === "out") return "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30";
  return "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20";
}

/** A signed amount reads its own direction, so the table never needs a key. */
export function signedAmount(flow: Flow, amount: number): number {
  return flow === "out" ? -Math.abs(amount) : Math.abs(amount);
}

export const TRANSACTION_RANGES = [7, 30, 90, 365, 0] as const;

/** `0` means everything ever — the only honest answer for a ledger. */
export function transactionRange(raw: string | undefined): number {
  const n = Number(raw);
  return (TRANSACTION_RANGES as readonly number[]).includes(n) ? n : 30;
}

export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
  { value: "0", label: "All time" },
];
