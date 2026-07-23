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

/** Seller's net earning on a single line (gross − commission). */
export function lineNet(line: CommissionLine): number {
  return line.unitPrice * line.quantity - lineCommission(line);
}

export interface EarningsSummary {
  gross: number;
  commission: number;
  net: number;
}

/** Aggregate gross, commission, and net across many lines. */
export function summarize(lines: CommissionLine[]): EarningsSummary {
  return lines.reduce<EarningsSummary>(
    (acc, l) => {
      const gross = l.unitPrice * l.quantity;
      const commission = lineCommission(l);
      acc.gross += gross;
      acc.commission += commission;
      acc.net += gross - commission;
      return acc;
    },
    { gross: 0, commission: 0, net: 0 },
  );
}

/** Round to 2dp for money display/storage. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}
