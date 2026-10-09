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

/**
 * Which list a kind belongs on.
 *
 *   data      the bundle business's own ledger
 *   retail    the mall's
 *   provider  movements on the wallet the bundles are bought *from*, which are
 *             not Nickimart's own books and keep to the top-ups tab
 */
export type TransactionScope = "data" | "retail" | "provider";

export interface TransactionKind {
  key: string;
  label: string;
  flow: Flow;
  scope: TransactionScope;
}

export const TRANSACTION_KINDS: TransactionKind[] = [
  // --- Data bundles -------------------------------------------------------
  { key: "BUNDLE_ORDER", label: "Bundle sale", flow: "in", scope: "data" },
  { key: "AFA", label: "AFA registration", flow: "in", scope: "data" },
  { key: "WALLET_TOPUP", label: "Agent wallet top-up", flow: "in", scope: "data" },
  { key: "REGISTRATION_FEE", label: "Agent registration fee", flow: "in", scope: "data" },
  // A sale paid out of an agent's float. The cash arrived when they topped the
  // float up, so counting it again here would bank the same cedi twice.
  { key: "WALLET_ORDER", label: "Bundle sale from float", flow: "internal", scope: "data" },
  { key: "COMMISSION", label: "Agent commission", flow: "internal", scope: "data" },
  { key: "REFERRAL", label: "Referral earnings", flow: "internal", scope: "data" },
  { key: "ADJUSTMENT", label: "Balance adjustment", flow: "internal", scope: "data" },
  // A cancelled sale credited to the agent's float rather than reversed on the
  // card: the money stayed with Nickimart and only changed hands internally.
  { key: "WALLET_REFUND", label: "Refund to agent float", flow: "internal", scope: "data" },
  { key: "REFUND", label: "Refund", flow: "out", scope: "data" },
  { key: "WITHDRAWAL", label: "Agent payout", flow: "out", scope: "data" },
  // --- Retail -------------------------------------------------------------
  { key: "ORDER_PAYMENT", label: "Order payment", flow: "in", scope: "retail" },
  { key: "VENDOR_PAYOUT", label: "Shop payout", flow: "out", scope: "retail" },
  { key: "AFFILIATE_PAYOUT", label: "Affiliate payout", flow: "out", scope: "retail" },
  // --- The provider's wallet ----------------------------------------------
  // Funding that wallet is a transfer, not a cost. The cedis move from one
  // Nickimart pocket to another and the business is no poorer for it: they
  // become stock, and they are expensed later as the cost of the bundles they
  // buy. Showing it as money out was double-counting the same cedi — once
  // here and again as the cost price of every order it funded — and it read
  // on the tab as a loss of GH₵300 on an afternoon when nothing was lost.
  { key: "PROVIDER_FUNDING", label: "Provider wallet funding", flow: "internal", scope: "provider" },
  // The float being spent, which is also internal: the cash left when the
  // float was funded. The row carries a negative amount of its own, so it
  // still reads as a reduction without being counted as a second outflow.
  { key: "PROVIDER_DEBIT", label: "Provider wallet debit", flow: "internal", scope: "provider" },
];

export function kindsFor(scope: TransactionScope): TransactionKind[] {
  return TRANSACTION_KINDS.filter((k) => k.scope === scope);
}

/** The dropdown for one console: every kind it records, and "all". */
export function kindOptions(scope: TransactionScope) {
  return [{ value: "all", label: "All kinds" }, ...kindsFor(scope).map((k) => ({ value: k.key, label: k.label }))];
}

/**
 * The kinds the top-ups tab deals in: money into an agent's float, and money
 * into and out of the provider's wallet. Three sources, one question — what is
 * being put in, and what is taking it out again.
 */
export const TOPUP_KINDS = ["WALLET_TOPUP", "PROVIDER_FUNDING", "PROVIDER_DEBIT"] as const;

export function topupKindOptions() {
  return [
    { value: "all", label: "All kinds" },
    ...TOPUP_KINDS.map((key) => ({ value: key, label: kindLabel(key) })),
  ];
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

/**
 * A signed amount reads its own direction, so the table never needs a key.
 *
 * Money out is always negative. Anything else keeps the sign it arrived with,
 * because a movement inside the platform can be a debit — an adjustment taking
 * money off an agent — and forcing it positive would have the column add up to
 * more than ever moved.
 */
export function signedAmount(flow: Flow, amount: number): number {
  return flow === "out" ? -Math.abs(amount) : amount;
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
