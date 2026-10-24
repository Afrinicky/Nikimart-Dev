// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension. The same convention src/lib/payment-routing.ts documents,
// and safe for the same reason — nothing here is ever emitted.
import {
  apportion,
  applyRate,
  floorAtZero,
  lineAmount,
  roundHalfAway,
  sum,
  type BasisPoints,
  type Pesewas,
} from "../money.ts";

/**
 * What goods actually cost by the time they are on our shelf.
 *
 * The brief asks to compare supplier offers "based on total expected
 * acquisition cost, not just unit price", and that phrase is doing a lot of
 * work. A Chinese supplier at $4.10 and a Ghanaian one at GH₵62 are not
 * comparable until the first has had freight, duty, clearing and an exchange
 * rate applied to it — and once they have, the cheaper unit price routinely
 * loses. Buying on unit price is the single most expensive habit in import
 * procurement.
 *
 * So: one function that takes an offer and returns what it lands at, and the
 * comparison is a sort over that figure. Everything is in integer pesewas
 * (src/lib/medical/money.ts) and every rate is basis points, because a 14%
 * duty on a 7,400-unit order compounds a float error into real money.
 *
 * Pure. No database, no Prisma, no `server-only` — so the arithmetic that
 * decides which supplier gets the order can actually be tested.
 */

export interface OfferLine {
  /** Whatever identifies the line to the caller. */
  id: string;
  quantity: number;
  /** Unit price in the supplier's own currency, as pesewas-of-that-currency. */
  unitPrice: Pesewas;
}

export interface Offer {
  id: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  /**
   * Units of GH₵ per one unit of the supplier's currency, as basis points
   * (1 USD = GH₵15.40 → 154_000). Recorded on the quote when it was entered,
   * never looked up at comparison time: comparing a March quote at today's
   * rate is how a margin disappears between the decision and the payment.
   */
  exchangeRate: BasisPoints;
  lines: OfferLine[];

  // --- Everything between the supplier's gate and ours --------------------
  /** Freight the supplier charges, in their currency. */
  freight: Pesewas;
  /** Insurance, in their currency. */
  insurance: Pesewas;
  /** Other supplier-side charges, in their currency. */
  otherSupplierCharges: Pesewas;
  /** Import duty, as a rate on the customs value. */
  dutyRate: BasisPoints;
  /** Clearing, handling and inland transport, in GH₵. */
  clearingGhs: Pesewas;
  /** Anything else, in GH₵. */
  otherGhs: Pesewas;

  /** Working days from order to our door. Not a cost, but part of the choice. */
  leadTimeDays: number;
  /** Whether the figures above are confirmed or still estimates. */
  costsConfirmed: boolean;
}

export interface LandedCost {
  offerId: string;
  supplierId: string;
  supplierName: string;
  /** Goods only, converted to GH₵. */
  goodsGhs: Pesewas;
  /** Supplier-side freight, insurance and charges, converted. */
  freightGhs: Pesewas;
  /**
   * The value duty is charged on: goods plus freight plus insurance. This is
   * the CIF convention, and getting it wrong — charging duty on goods alone —
   * understates the landed cost of every imported line.
   */
  customsValueGhs: Pesewas;
  dutyGhs: Pesewas;
  clearingGhs: Pesewas;
  otherGhs: Pesewas;
  /** Everything, in GH₵. The only figure two offers may be compared on. */
  totalGhs: Pesewas;
  /** Total ÷ units, rounded. What one unit costs us on the shelf. */
  perUnitGhs: Pesewas;
  totalUnits: number;
  leadTimeDays: number;
  costsConfirmed: boolean;
}

export function landedCostOf(offer: Offer): LandedCost {
  const goodsLocal = sum(offer.lines.map((line) => lineAmount(line.quantity, line.unitPrice)));
  const freightLocal = offer.freight + offer.insurance + offer.otherSupplierCharges;

  const goodsGhs = convert(goodsLocal, offer.exchangeRate);
  const freightGhs = convert(freightLocal, offer.exchangeRate);

  const customsValueGhs = goodsGhs + freightGhs;
  const dutyGhs = applyRate(customsValueGhs, offer.dutyRate);

  const totalGhs = customsValueGhs + dutyGhs + offer.clearingGhs + offer.otherGhs;
  const totalUnits = offer.lines.reduce((n, line) => n + Math.trunc(line.quantity), 0);

  return {
    offerId: offer.id,
    supplierId: offer.supplierId,
    supplierName: offer.supplierName,
    goodsGhs,
    freightGhs,
    customsValueGhs,
    dutyGhs,
    clearingGhs: offer.clearingGhs,
    otherGhs: offer.otherGhs,
    totalGhs,
    perUnitGhs: totalUnits > 0 ? roundHalfAway(totalGhs / totalUnits) : 0,
    totalUnits,
    leadTimeDays: offer.leadTimeDays,
    costsConfirmed: offer.costsConfirmed,
  };
}

/** A supplier's currency amount in GH₵, at the rate recorded on the quote. */
export function convert(amount: Pesewas, exchangeRate: BasisPoints): Pesewas {
  return applyRate(amount, exchangeRate);
}

export interface Comparison {
  ranked: LandedCost[];
  /** The cheapest landed, or null when there is nothing to compare. */
  best: LandedCost | null;
  /**
   * What the cheapest *unit price* would have been, when that is a different
   * supplier. The whole point of the screen: showing the buyer the offer they
   * would have picked by eye, and what it would have cost.
   */
  cheapestByUnitPrice: LandedCost | null;
  /** What choosing on landed cost saves against that. Never negative. */
  savingAgainstUnitPriceChoice: Pesewas;
  /** True when any offer in the set is still carrying estimated costs. */
  hasEstimates: boolean;
}

/**
 * Rank offers by what they land at.
 *
 * Ties break on lead time, then on confirmed costs: between two offers at the
 * same money, the one that arrives sooner wins, and between two at the same
 * money and the same date, the one whose figures are confirmed wins over the
 * one still carrying estimates.
 */
export function compareOffers(offers: readonly Offer[]): Comparison {
  if (offers.length === 0) {
    return {
      ranked: [],
      best: null,
      cheapestByUnitPrice: null,
      savingAgainstUnitPriceChoice: 0,
      hasEstimates: false,
    };
  }

  const costed = offers.map(landedCostOf);
  const ranked = [...costed].sort(
    (a, b) =>
      a.totalGhs - b.totalGhs ||
      a.leadTimeDays - b.leadTimeDays ||
      Number(b.costsConfirmed) - Number(a.costsConfirmed),
  );

  // What a buyer comparing unit prices by eye would have chosen. Converted at
  // each offer's own rate, or a dollar price would look cheaper than a cedi one
  // for no reason but the symbol in front of it.
  const byUnitPrice = offers
    .map((offer) => ({
      offer,
      unit: cheapestUnitPriceGhs(offer),
    }))
    .sort((a, b) => a.unit - b.unit)[0];

  const naiveChoice = costed.find((entry) => entry.offerId === byUnitPrice?.offer.id) ?? null;
  const best = ranked[0] ?? null;

  return {
    ranked,
    best,
    cheapestByUnitPrice: naiveChoice && best && naiveChoice.offerId !== best.offerId ? naiveChoice : null,
    savingAgainstUnitPriceChoice:
      naiveChoice && best ? floorAtZero(naiveChoice.totalGhs - best.totalGhs) : 0,
    hasEstimates: costed.some((entry) => !entry.costsConfirmed),
  };
}

/** The lowest unit price on an offer, in GH₵ — the figure that misleads. */
function cheapestUnitPriceGhs(offer: Offer): Pesewas {
  if (offer.lines.length === 0) return 0;
  return Math.min(...offer.lines.map((line) => convert(line.unitPrice, offer.exchangeRate)));
}

/**
 * Spread a purchase order's landed costs back over its lines, by value.
 *
 * What actually goes into inventory. A box of gloves on an order that paid
 * GH₵4,200 of freight did not cost what the supplier charged for it, and
 * valuing stock at the invoice price overstates every margin downstream.
 *
 * By value rather than by weight or by unit: value is the one basis that is
 * always available on a purchase order, and a landed cost apportioned by units
 * puts as much freight on a GH₵12 swab as on a GH₵32,500 analyser.
 *
 * `apportion` guarantees the parts add back to exactly the charge, so the sum
 * of the lines' landed costs equals what was actually paid — to the pesewa.
 */
export function apportionLandedCosts(
  lines: readonly { id: string; quantity: number; unitCost: Pesewas }[],
  /** Everything above the goods value, in GH₵. */
  landedChargesGhs: Pesewas,
): { id: string; lineGoods: Pesewas; lineCharges: Pesewas; landedUnitCost: Pesewas }[] {
  const goods = lines.map((line) => lineAmount(line.quantity, line.unitCost));
  const shares = apportion(landedChargesGhs, goods);

  return lines.map((line, index) => {
    const lineGoods = goods[index];
    const lineCharges = shares[index];
    const units = Math.trunc(line.quantity);
    return {
      id: line.id,
      lineGoods,
      lineCharges,
      landedUnitCost: units > 0 ? roundHalfAway((lineGoods + lineCharges) / units) : 0,
    };
  });
}

/**
 * The new weighted average cost after a receipt.
 *
 * Stock valuation and cost of goods sold both read this. Averaged rather than
 * replaced: receiving 20 units at GH₵310 when 80 are already held at GH₵280
 * does not make the 80 worth GH₵310, and writing the latest cost over the
 * average is how a quarter's profit moves on a single delivery.
 *
 * A receipt into zero stock takes the new cost outright — there is nothing to
 * average against, and carrying forward the cost of stock that no longer
 * exists is worse than forgetting it.
 */
export function weightedAverageCost(
  existingQuantity: number,
  existingAverage: Pesewas,
  receivedQuantity: number,
  receivedUnitCost: Pesewas,
): Pesewas {
  const held = Math.max(0, Math.trunc(existingQuantity));
  const received = Math.max(0, Math.trunc(receivedQuantity));
  if (received <= 0) return existingAverage;
  if (held <= 0) return receivedUnitCost;

  const totalValue = held * existingAverage + received * receivedUnitCost;
  return roundHalfAway(totalValue / (held + received));
}
