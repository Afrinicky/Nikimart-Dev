/**
 * The vocabulary of a purchase: how a supplier was paid, what for, and where
 * a claim against them stands.
 *
 * Its own module because the forms that offer these as dropdowns are client
 * components and the read that fetches a purchase is not. One file holding
 * both would drag the database client into the browser bundle, which is the
 * error `server-only` exists to raise.
 */

export const PAYMENT_METHODS = [
  { value: "momo", label: "Mobile money" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_KINDS = [
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Balance" },
  { value: "freight", label: "Freight" },
  { value: "refund", label: "Refund from supplier" },
  { value: "other", label: "Other" },
] as const;

export const DISPUTE_STATUSES = [
  { value: "none", label: "No problem" },
  { value: "raised", label: "Raised with the supplier" },
  { value: "refunded", label: "Refunded" },
  { value: "written_off", label: "Written off" },
] as const;

export function methodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? (value || "—");
}

export function paymentKindLabel(value: string): string {
  return PAYMENT_KINDS.find((k) => k.value === value)?.label ?? value;
}

export function disputeLabel(value: string): string {
  return DISPUTE_STATUSES.find((d) => d.value === value)?.label ?? value;
}

/** A refund reduces what the purchase cost us; everything else adds to it. */
export function signedGhs(p: { kind: string; amountGhs: number }): number {
  return p.kind === "refund" ? -p.amountGhs : p.amountGhs;
}

/**
 * What this purchase has cost and what is still owed on it.
 *
 * `totalCost` is what the goods were worth at the prices the buyers paid — it
 * is what the queue added up, not what the supplier charged. Once a supplier
 * price is recorded that becomes the figure the balance is measured against,
 * because that is the number on the invoice.
 */
export function purchaseMoney(p: {
  totalCost: number;
  supplierCost: number;
  fxRate: number;
  currency: string;
  payments: { kind: string; amountGhs: number }[];
}) {
  const agreedGhs =
    p.supplierCost > 0 ? (p.fxRate > 0 ? p.supplierCost * p.fxRate : p.supplierCost) : p.totalCost;
  const paid = p.payments.reduce((s, x) => s + signedGhs(x), 0);
  return {
    /** What the supplier is owed, in GH₵. */
    agreed: Math.round(agreedGhs * 100) / 100,
    /** Net of any refund they sent back. */
    paid: Math.round(paid * 100) / 100,
    outstanding: Math.round(Math.max(0, agreedGhs - paid) * 100) / 100,
    /** True when the supplier has been paid more than was agreed. */
    overpaid: paid - agreedGhs > 0.005,
    /** What the goods were sold for, which is what is at risk if they vanish. */
    atRisk: Math.round(p.totalCost * 100) / 100,
  };
}

/** The documents box, one per line, as `label|url` or a bare url. */
export function parseDocuments(raw: string): { label: string; url: string }[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("|");
      if (at < 0) return { label: shortUrl(line), url: line };
      return { label: line.slice(0, at).trim() || shortUrl(line.slice(at + 1)), url: line.slice(at + 1).trim() };
    })
    .filter((d) => /^https?:\/\//i.test(d.url));
}

function shortUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/** Only http(s) links are stored — a `javascript:` href in an admin console is an XSS. */
export function safeUrl(raw: string): string {
  const value = raw.trim();
  return /^https?:\/\//i.test(value) ? value : "";
}
