// Relative with the extension — reached from a *.test.ts.
import { roundHalfAway, sum, type Pesewas } from "../money.ts";

/**
 * Which batches a dispatch comes out of.
 *
 * First-expiry-first-out, not first-in-first-out. They are different the
 * moment a supplier ships you a short-dated lot: a batch received last week
 * expiring in March must go before one received last year expiring in
 * December, and FIFO would send the long-dated stock and leave the March lot
 * to be written off. In a reagent business that write-off is the difference
 * between a margin and a loss.
 *
 * Quarantined batches are physically present and not sellable, so they are
 * excluded here and still counted in valuation. Batches with no expiry at all
 * — forceps, racks, anything that does not perish — sort last, because a batch
 * that cannot expire should never be consumed ahead of one that can.
 *
 * Pure, and tested: picking the wrong batch is a recall that cannot be traced.
 */

export interface BatchLike {
  id: string;
  quantityRemaining: number;
  expiryDate: Date | null;
  receivedAt: Date;
  unitCost: Pesewas;
  isQuarantined: boolean;
}

export interface Allocation {
  batchId: string;
  quantity: number;
  unitCost: Pesewas;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** What was actually allocated. Below the request when stock ran out. */
  allocated: number;
  /** What could not be covered. Zero on a complete allocation. */
  shortfall: number;
  /** What the allocated units cost us, at the batches' own landed costs. */
  costOfGoods: Pesewas;
}

/** Sellable batches, in the order they should be consumed. */
export function sellableBatches(batches: readonly BatchLike[]): BatchLike[] {
  return batches
    .filter((batch) => !batch.isQuarantined && batch.quantityRemaining > 0)
    .sort((a, b) => {
      // No expiry sorts last, whichever side it is on.
      if (a.expiryDate && !b.expiryDate) return -1;
      if (!a.expiryDate && b.expiryDate) return 1;
      if (a.expiryDate && b.expiryDate) {
        const diff = a.expiryDate.getTime() - b.expiryDate.getTime();
        if (diff !== 0) return diff;
      }
      // Same expiry, or neither has one: oldest receipt first, so the shelf
      // actually turns over instead of the newest pallet being picked.
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
}

export function allocate(batches: readonly BatchLike[], quantity: number): AllocationResult {
  const wanted = Math.max(0, Math.trunc(quantity));
  const allocations: Allocation[] = [];
  let left = wanted;

  for (const batch of sellableBatches(batches)) {
    if (left <= 0) break;
    const take = Math.min(left, batch.quantityRemaining);
    if (take <= 0) continue;
    allocations.push({ batchId: batch.id, quantity: take, unitCost: batch.unitCost });
    left -= take;
  }

  const allocated = wanted - left;
  return {
    allocations,
    allocated,
    shortfall: left,
    costOfGoods: sum(allocations.map((a) => a.quantity * a.unitCost)),
  };
}

/**
 * Stock valuation: what is on the shelf, at what it cost.
 *
 * Quarantined batches are included. They are goods the business owns and has
 * paid for; excluding them understates the balance sheet. They are excluded
 * from *availability*, which is a different question asked on a different
 * screen.
 */
export function valuation(batches: readonly BatchLike[]): {
  units: number;
  value: Pesewas;
  quarantinedUnits: number;
} {
  const held = batches.filter((batch) => batch.quantityRemaining > 0);
  return {
    units: held.reduce((n, batch) => n + batch.quantityRemaining, 0),
    value: sum(held.map((batch) => batch.quantityRemaining * batch.unitCost)),
    quarantinedUnits: held
      .filter((batch) => batch.isQuarantined)
      .reduce((n, batch) => n + batch.quantityRemaining, 0),
  };
}

/** Batches expiring within `days`, soonest first. What the console nags about. */
export function expiringWithin(
  batches: readonly BatchLike[],
  days: number,
  from: Date = new Date(),
): BatchLike[] {
  const horizon = new Date(from);
  horizon.setDate(horizon.getDate() + days);
  return batches
    .filter(
      (batch) =>
        batch.quantityRemaining > 0 &&
        batch.expiryDate !== null &&
        batch.expiryDate >= from &&
        batch.expiryDate <= horizon,
    )
    .sort((a, b) => (a.expiryDate!.getTime() - b.expiryDate!.getTime()));
}

/** Batches already past their date and still holding stock. */
export function expired(batches: readonly BatchLike[], from: Date = new Date()): BatchLike[] {
  return batches.filter(
    (batch) =>
      batch.quantityRemaining > 0 && batch.expiryDate !== null && batch.expiryDate < from,
  );
}

/**
 * The average cost of what is actually held, from the batches themselves.
 *
 * A cross-check on `MedicalProduct.averageCost`, which is maintained
 * incrementally on every receipt. The two should agree; where they do not, the
 * batches are right, because they are the record of what was paid.
 */
export function averageCostOfHeld(batches: readonly BatchLike[]): Pesewas {
  const { units, value } = valuation(batches);
  return units > 0 ? roundHalfAway(value / units) : 0;
}
