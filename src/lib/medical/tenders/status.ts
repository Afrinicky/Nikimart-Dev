// Relative with the extension — reached from a *.test.ts.
import { lineAmount, sum, type Pesewas } from "../money.ts";

/**
 * What became of a tender.
 *
 * The rule this module exists to enforce, and the one most procurement systems
 * get wrong: **a tender is not won or lost.** A published list of forty lines
 * comes back with eleven awarded to us, twenty-six awarded elsewhere and three
 * awarded at a reduced quantity — frequently split across two suppliers so the
 * institution keeps both of them honest. A system that records one verdict per
 * tender records that as a loss, and the business learns nothing from it.
 *
 * So the outcome lives on the line. The tender's own status is *derived* from
 * its lines and never typed in, which is why this is a pure function with a
 * test rather than a dropdown.
 *
 * Pure. No Prisma, no database.
 */

export type ItemOutcome =
  | "PENDING"
  | "AWARDED"
  | "PARTIALLY_AWARDED"
  | "NOT_AWARDED"
  | "WITHDRAWN"
  | "CANCELLED";

export type TenderStatus =
  | "IDENTIFIED"
  | "PREPARING"
  | "SUBMITTED"
  | "UNDER_EVALUATION"
  | "AWARDED"
  | "PARTIALLY_AWARDED"
  | "NOT_AWARDED"
  | "CANCELLED"
  | "EXPIRED"
  | "WITHDRAWN";

export interface OutcomeLine {
  outcome: ItemOutcome;
  /** A line we chose not to bid. Counts in neither the win nor the loss. */
  isNoBid: boolean;
  quantity: number;
  awardedQuantity: number;
  unitPrice: Pesewas;
  awardedUnitPrice: Pesewas;
  unitCostAtBid: Pesewas;
}

export interface TenderOutcome {
  status: TenderStatus;
  /** Lines we actually bid. The denominator for every rate below. */
  bidLines: number;
  noBidLines: number;
  awardedLines: number;
  partiallyAwardedLines: number;
  lostLines: number;
  pendingLines: number;
  /** What we offered on the lines we bid. */
  offeredValue: Pesewas;
  /** What was actually awarded, at the awarded price and quantity. */
  awardedValue: Pesewas;
  /** What those awarded goods cost us when we bid. Private. */
  awardedCost: Pesewas;
  /** Awarded value less awarded cost. Private, and the figure that matters. */
  awardedMargin: Pesewas;
  /**
   * Awarded lines over lines bid, as a percentage to one decimal. Null while
   * anything is still pending — a hit rate computed before the result is in
   * is a number that will be quoted and will be wrong.
   */
  hitRate: number | null;
}

/**
 * The value of a line as awarded.
 *
 * An institution often awards at a price it names rather than the one offered,
 * so the awarded price is used where there is one and the offered price stands
 * in where there is not. Quantity is the awarded quantity, which on a partial
 * award is less than the quantity bid.
 */
export function awardedLineValue(line: OutcomeLine): Pesewas {
  if (line.outcome !== "AWARDED" && line.outcome !== "PARTIALLY_AWARDED") return 0;
  const price = line.awardedUnitPrice > 0 ? line.awardedUnitPrice : line.unitPrice;
  const quantity = line.awardedQuantity > 0 ? line.awardedQuantity : line.quantity;
  return lineAmount(quantity, price);
}

export function summarise(lines: readonly OutcomeLine[]): TenderOutcome {
  const bid = lines.filter((line) => !line.isNoBid);
  const noBidLines = lines.length - bid.length;

  const awardedLines = bid.filter((line) => line.outcome === "AWARDED").length;
  const partiallyAwardedLines = bid.filter((line) => line.outcome === "PARTIALLY_AWARDED").length;
  const lostLines = bid.filter((line) => line.outcome === "NOT_AWARDED").length;
  const pendingLines = bid.filter((line) => line.outcome === "PENDING").length;
  const won = awardedLines + partiallyAwardedLines;

  const offeredValue = sum(bid.map((line) => lineAmount(line.quantity, line.unitPrice)));
  const awardedValue = sum(bid.map(awardedLineValue));
  const awardedCost = sum(
    bid.map((line) => {
      if (line.outcome !== "AWARDED" && line.outcome !== "PARTIALLY_AWARDED") return 0;
      const quantity = line.awardedQuantity > 0 ? line.awardedQuantity : line.quantity;
      return lineAmount(quantity, line.unitCostAtBid);
    }),
  );

  return {
    status: deriveStatus(bid.length, won, lostLines, pendingLines, awardedLines),
    bidLines: bid.length,
    noBidLines,
    awardedLines,
    partiallyAwardedLines,
    lostLines,
    pendingLines,
    offeredValue,
    awardedValue,
    awardedCost,
    awardedMargin: awardedValue - awardedCost,
    hitRate:
      pendingLines > 0 || bid.length === 0
        ? null
        : Math.round((won / bid.length) * 1000) / 10,
  };
}

function deriveStatus(
  bidCount: number,
  won: number,
  lost: number,
  pending: number,
  fullyAwarded: number,
): TenderStatus {
  // Nothing bid at all: the tender was looked at and left alone.
  if (bidCount === 0) return "IDENTIFIED";
  // Anything still outstanding means the result is not in, whatever else has
  // come back. Calling a tender "awarded" while eleven lines are undecided is
  // the error that makes a pipeline figure useless.
  if (pending > 0) return "UNDER_EVALUATION";
  if (won === 0) return "NOT_AWARDED";
  // Every line we bid came back, all of them in full.
  if (fullyAwarded === bidCount) return "AWARDED";
  return "PARTIALLY_AWARDED";
}

/**
 * Whether a derived status may replace what is stored.
 *
 * Only the outcome statuses are derived. A tender somebody cancelled, withdrew
 * from, or let expire stays that way — those are decisions, not results, and
 * recomputing them from the lines would quietly undo them.
 */
export function mayDeriveStatus(stored: string): boolean {
  return !["CANCELLED", "WITHDRAWN", "EXPIRED"].includes(stored);
}

/**
 * How long until a deadline, and whether that is a problem.
 *
 * `critical` at seven days rather than one: a tender submission needs
 * documents gathered, prices confirmed with suppliers and somebody to sign,
 * and a warning that arrives the day before is a warning that arrives too late
 * to act on.
 */
export function deadlinePressure(
  deadline: Date | null,
  from: Date = new Date(),
): "none" | "upcoming" | "critical" | "passed" {
  if (!deadline) return "none";
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const days = Math.round((b - a) / 86_400_000);
  if (days < 0) return "passed";
  if (days <= 7) return "critical";
  if (days <= 30) return "upcoming";
  return "none";
}
