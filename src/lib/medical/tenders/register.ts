// Relative with the extension — reached from a *.test.ts.
import { floorAtZero, type Pesewas } from "../money.ts";

/**
 * The approved-product register: what we may supply to an institution, at what
 * price, until when.
 *
 * This is what the tender section exists to produce. An award is not a sale
 * and not an order — it is permission, with a price and a period on it — and
 * the question it answers is the one a salesperson asks every day: *can we
 * supply this to Korle Bu, and at what price?*
 *
 * Three things end an entry, and all three are checked here rather than being
 * left to a status column somebody has to remember to update:
 *
 *   the date passes      a contract runs out
 *   the quantity runs out a framework for 1,000 boxes is done at 1,000
 *   somebody suspends it  a dispute, a recall, a renegotiation
 *
 * The second is the one that is always missed. An award is a ceiling, and
 * quoting the 1,001st box at the awarded price is a loss nobody notices until
 * the year is costed.
 *
 * Pure, and tested: a lapsed award applied to a live quotation is a document
 * that has to be withdrawn.
 */

export type RegisterStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "SUSPENDED" | "SUPERSEDED" | "CANCELLED";

export interface RegisterEntry {
  id: string;
  productId: string | null;
  description: string;
  unitPrice: Pesewas;
  unit: string;
  /** Zero means no ceiling: an open framework rather than a fixed quantity. */
  quantityAwarded: number;
  quantityDrawn: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  validFrom: Date;
  validUntil: Date | null;
  /** What is stored. Decisions here win over anything derived. */
  status: RegisterStatus;
}

export interface RegisterState {
  /** What the entry really is today, dates and drawdown taken into account. */
  status: RegisterStatus;
  /** Whether it may be applied to a quotation right now. */
  isUsable: boolean;
  /** How much is left under a ceiling. Null when there is none. */
  remaining: number | null;
  /** Days until it lapses. Null when it does not, negative when it has. */
  daysRemaining: number | null;
  /** One line a salesperson can read without opening the tender. */
  reason: string;
}

export function stateOf(entry: RegisterEntry, now: Date = new Date()): RegisterState {
  const remaining =
    entry.quantityAwarded > 0 ? floorAtZero(entry.quantityAwarded - entry.quantityDrawn) : null;
  const daysRemaining = entry.validUntil ? daysBetween(now, entry.validUntil) : null;

  // A decision somebody made wins over anything computed. Recomputing a
  // suspension from the dates would quietly undo it.
  if (entry.status === "SUSPENDED" || entry.status === "CANCELLED" || entry.status === "SUPERSEDED") {
    return {
      status: entry.status,
      isUsable: false,
      remaining,
      daysRemaining,
      reason:
        entry.status === "SUSPENDED"
          ? "Suspended. Somebody has put this arrangement on hold."
          : entry.status === "SUPERSEDED"
            ? "Superseded by a later award."
            : "Cancelled.",
    };
  }

  if (entry.validFrom > now) {
    return {
      status: "ACTIVE",
      isUsable: false,
      remaining,
      daysRemaining,
      reason: "Not in force yet.",
    };
  }

  if (daysRemaining !== null && daysRemaining < 0) {
    return {
      status: "EXPIRED",
      isUsable: false,
      remaining,
      daysRemaining,
      reason: `Expired ${Math.abs(daysRemaining)} days ago.`,
    };
  }

  if (remaining !== null && remaining <= 0) {
    return {
      status: "EXHAUSTED",
      isUsable: false,
      remaining: 0,
      daysRemaining,
      reason: `Fully drawn: all ${entry.quantityAwarded} ${entry.unit} awarded have been ordered.`,
    };
  }

  return {
    status: "ACTIVE",
    isUsable: true,
    remaining,
    daysRemaining,
    reason: describeActive(entry, remaining, daysRemaining),
  };
}

function describeActive(
  entry: RegisterEntry,
  remaining: number | null,
  daysRemaining: number | null,
): string {
  const parts: string[] = [];
  if (remaining !== null) parts.push(`${remaining} of ${entry.quantityAwarded} ${entry.unit} left`);
  if (daysRemaining !== null) {
    parts.push(
      daysRemaining === 0
        ? "expires today"
        : daysRemaining <= 30
          ? `expires in ${daysRemaining} days`
          : `valid for ${daysRemaining} more days`,
    );
  }
  return parts.length > 0 ? `Approved — ${parts.join(", ")}.` : "Approved, with no expiry.";
}

/**
 * How much of an order may be priced under an entry.
 *
 * A quantity above what is left is not refused outright: the register covers
 * part of it at the agreed price and the rest is priced normally, which is
 * what actually happens commercially. Returning both halves lets the
 * quotation editor say so rather than silently applying the wrong price to
 * the whole line.
 */
export function drawdownFor(
  entry: RegisterEntry,
  wanted: number,
  now: Date = new Date(),
): { atAgreedPrice: number; atListPrice: number; blocked: boolean } {
  const state = stateOf(entry, now);
  if (!state.isUsable) return { atAgreedPrice: 0, atListPrice: wanted, blocked: true };
  if (state.remaining === null) return { atAgreedPrice: wanted, atListPrice: 0, blocked: false };

  const covered = Math.min(wanted, state.remaining);
  return { atAgreedPrice: covered, atListPrice: wanted - covered, blocked: false };
}

/**
 * The entry that should be offered for a product at an institution.
 *
 * Usable entries only, and among them the one expiring soonest — a framework
 * with three weeks left should be drawn down before one with a year, or the
 * first will lapse unused. Ties go to the lower price, which is the one the
 * customer is entitled to.
 */
export function bestEntryFor(
  entries: readonly RegisterEntry[],
  productId: string,
  now: Date = new Date(),
): RegisterEntry | null {
  const usable = entries
    .filter((entry) => entry.productId === productId && stateOf(entry, now).isUsable)
    .sort((a, b) => {
      const aEnds = a.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
      const bEnds = b.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
      return aEnds - bEnds || a.unitPrice - b.unitPrice;
    });
  return usable[0] ?? null;
}

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}
