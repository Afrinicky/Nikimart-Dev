/**
 * The bill a cart adds up to, and what a buyer settles today.
 *
 * Split out of `cart-pricing` — which reads the database and is server-only —
 * because the checkout screen and the order summary render these numbers in the
 * browser. They are types and arithmetic, nothing more: the figures themselves
 * are always computed on the server, and the client only ever renders what it
 * was handed.
 */

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** The parts of a shipping charge. Admin, seller and finance only. */
export interface ShippingComponents {
  supplierFreight: number;
  internationalFreight: number;
  localFreight: number;
  importDuty: number;
  clearingFee: number;
  tax: number;
  originTax: number;
}

const ZERO_COMPONENTS: ShippingComponents = {
  supplierFreight: 0,
  internationalFreight: 0,
  localFreight: 0,
  importDuty: 0,
  clearingFee: 0,
  tax: 0,
  originTax: 0,
};

/** What a cart costs. Two numbers for the buyer, the rest for everyone else. */
export interface CartBill {
  /** The goods: what the sellers charge. */
  goods: number;
  /** Everything else, as one figure. This is the only other number a buyer sees. */
  shipping: number;
  total: number;
  /**
   * The shipping a buyer may settle at collection instead of now.
   *
   * The goods are never deferrable: a seller spends that money the moment they
   * fulfil the order, so it is paid in full at checkout. The courier run has
   * not happened yet, and a seller willing to carry that gap can say so on the
   * listing — which is the only thing this number is.
   */
  deferrable: number;
  /** What is due today when the shipping is left until collection. */
  goodsOnlyNow: number;
  components: ShippingComponents;
}

export function emptyBill(goods = 0, shipping = 0): CartBill {
  return {
    goods: round(goods),
    shipping: round(shipping),
    total: round(goods + shipping),
    deferrable: 0,
    goodsOnlyNow: round(goods + shipping),
    components: { ...ZERO_COMPONENTS },
  };
}

/**
 * How much of the bill is settled at checkout.
 *
 *   full               — goods and shipping, now.
 *   shipping_on_pickup — the goods now, the shipping when they collect.
 *
 * `goods_only` is the value orders placed under the previous rules were stored
 * with. It meant the same thing then and is read as the same thing now, so past
 * orders keep displaying correctly without a backfill.
 */
export type PaymentPlan = "full" | "shipping_on_pickup";

export const LEGACY_DEFERRED_PLAN = "goods_only";

/** True for any stored plan that means "the shipping was left until collection". */
export function isDeferredPlan(plan: string | null | undefined): boolean {
  return plan === "shipping_on_pickup" || plan === LEGACY_DEFERRED_PLAN;
}

/** What is charged today, given the plan the buyer chose. */
export function amountDueNow(bill: CartBill, plan: PaymentPlan): number {
  return plan === "shipping_on_pickup" ? bill.goodsOnlyNow : bill.total;
}

/** What is left to settle at collection, given the plan. */
export function balanceAfter(bill: CartBill, plan: PaymentPlan): number {
  return plan === "shipping_on_pickup" ? bill.deferrable : 0;
}
