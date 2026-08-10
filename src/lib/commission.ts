/**
 * Platform commission maths. NikiMart takes a percentage of each sale (like
 * Jumia). The rate resolves per item as: category override → platform default.
 * The resolved rate is snapshotted onto the order item at sale time, so payouts
 * stay accurate even if rates change afterwards.
 */

export interface CommissionLine {
  unitPrice: number;
  quantity: number;
  /** Commission percent applied to this line (0–100). */
  commissionRate: number;
  /** Affiliate commission cash on this line, if it was a referred sale. */
  affiliateCommission?: number;
  /** Who funds that affiliate commission: "seller" | "platform" | "". */
  affiliateFundedBy?: string;
}

/** The part of a line's affiliate commission the seller pays for. */
export function sellerAffiliateCost(line: CommissionLine): number {
  return line.affiliateFundedBy === "seller" ? (line.affiliateCommission ?? 0) : 0;
}

/** The part of a line's affiliate commission NikiMart pays for. */
export function platformAffiliateCost(line: CommissionLine): number {
  return line.affiliateFundedBy === "platform" ? (line.affiliateCommission ?? 0) : 0;
}

/** Resolve the effective rate for a product: category override, else default. */
export function resolveCommissionRate(
  categoryRate: number | null | undefined,
  defaultRate: number,
): number {
  const r = categoryRate ?? defaultRate;
  return Number.isFinite(r) && r >= 0 && r <= 100 ? r : 0;
}

/** Commission charged on a single line (gross × rate%). */
export function lineCommission(line: CommissionLine): number {
  return (line.unitPrice * line.quantity * line.commissionRate) / 100;
}

/**
 * Seller's net earning on a single line: gross, less the platform commission,
 * less any affiliate commission the seller themselves agreed to fund.
 */
export function lineNet(line: CommissionLine): number {
  return line.unitPrice * line.quantity - lineCommission(line) - sellerAffiliateCost(line);
}

export interface EarningsSummary {
  gross: number;
  commission: number;
  net: number;
  /** Affiliate commission funded by the seller across these lines. */
  affiliateCost: number;
}

/** Aggregate gross, commission, affiliate cost, and net across many lines. */
export function summarize(lines: CommissionLine[]): EarningsSummary {
  return lines.reduce<EarningsSummary>(
    (acc, l) => {
      const gross = l.unitPrice * l.quantity;
      const commission = lineCommission(l);
      const affiliateCost = sellerAffiliateCost(l);
      acc.gross += gross;
      acc.commission += commission;
      acc.affiliateCost += affiliateCost;
      acc.net += gross - commission - affiliateCost;
      return acc;
    },
    { gross: 0, commission: 0, net: 0, affiliateCost: 0 },
  );
}

/** Round to 2dp for money display/storage. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}
