/**
 * The arithmetic behind an agent sale, as a pure module.
 *
 * Kept out of agents.ts (which is server-only, because it imports Prisma) so
 * the rules can be tested directly and reused anywhere. Getting these wrong is
 * expensive in a specific way: too generous and Nickimart funds an agent's
 * discount out of its own margin; too mean and an agent is owed less than their
 * storefront told them they'd earn.
 */

/** Round to the pesewa. Money should never carry floating-point dust. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * What an agent earns on one sale: whatever they charged above the agent price
 * Nickimart charges them. Never negative — an agent who somehow sold under cost
 * earns nothing rather than owing money.
 */
export function commissionOn(salePrice: number, agentCost: number): number {
  return Math.max(0, round2(salePrice - agentCost));
}

/** An agent's price at a given markup over their cost. */
export function priceAtMarkup(agentCost: number, markupPercent: number): number {
  return round2(agentCost * (1 + markupPercent / 100));
}

/**
 * The agent price Nickimart sets from a retail price and a discount, floored at
 * the provider's own cost. Selling to an agent below cost would mean paying
 * them to sell.
 */
export function agentPriceFromRetail(
  retailPrice: number,
  discountPercent: number,
  providerCost: number,
): number {
  return Math.max(round2(providerCost), round2(retailPrice * (1 - discountPercent / 100)));
}

/**
 * The most an agent may ask for right now.
 *
 * Only the balance and the fee come into it. A pending request has *already*
 * been debited — requestWithdrawal posts the whole amount plus fee to the
 * ledger the moment it is made, precisely so it can't be spent twice while an
 * admin works through the queue — so subtracting it again here would hold back
 * money the agent still has.
 */
export function maxWithdrawal(balance: number, fee: number): number {
  return Math.max(0, round2(balance - fee));
}


/**
 * What is still outstanding on a setup fee.
 *
 * A new agent opens at −setupFee and climbs through zero as commission lands,
 * so the outstanding amount is however far below zero they still are — capped
 * at the fee itself, since a balance pushed further negative by an admin
 * adjustment isn't setup fee.
 */
export function outstandingSetupFee(balance: number, setupFee: number): number {
  if (balance >= 0) return 0;
  return round2(Math.min(-balance, setupFee));
}
