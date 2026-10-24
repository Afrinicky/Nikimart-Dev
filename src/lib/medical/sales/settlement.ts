import { lineAmount, sum, type Pesewas } from "../money.ts";

/**
 * What an order is worth on delivery, and what the customer owes for it.
 *
 * Pure, and separate from the action that writes it, because this is the
 * arithmetic that decides a receivable and it is the kind of arithmetic that
 * is got wrong quietly. The first version of the delivery action computed the
 * payable from the goods alone and so dropped the delivery charge off every
 * order that carried one — a charge the customer agreed to and would never
 * have been billed for. That is a sum, not a workflow, and a sum belongs
 * somewhere it can be tested.
 *
 * Relative import with the `.ts` extension, per the house convention, so this
 * module is reachable from `node --test`.
 */

export interface DispatchedLine {
  /** Units that actually left, never the quantity ordered. */
  quantityDispatched: number;
  unitPrice: Pesewas;
}

export interface OrderCharges {
  /** Charges the customer agreed to on top of the goods. */
  deliveryCharge: Pesewas;
  handlingCharge: Pesewas;
  otherCharge: Pesewas;
  /**
   * Tax. Always zero today: Ghana's VAT/NHIL/GETFund cannot be expressed as
   * one rate and no treatment is implemented, which `docs/medical/REGULATORY.md`
   * states. The field is here so that when it is implemented it lands in the
   * one place that computes a payable, rather than in four screens.
   */
  taxAmount: Pesewas;
  discountAmount: Pesewas;
}

export interface DeliveryAmounts {
  /** Goods that left, at the order's own prices. */
  goods: Pesewas;
  /** Everything added on top of the goods. */
  charges: Pesewas;
  discount: Pesewas;
  /** What was earned: goods plus charges, before the discount. */
  revenue: Pesewas;
  /** What the customer owes: revenue less the discount, never below zero. */
  payable: Pesewas;
}

/**
 * The figures a delivery produces.
 *
 * Three decisions are deliberate and each is a decision somebody will
 * otherwise make differently next time:
 *
 *  - **Goods are what was dispatched, not what was ordered.** Billing for ten
 *    when nine went out creates a receivable nobody will pay.
 *  - **The discount applies in full, not pro-rated.** It was agreed on the
 *    order. Apportioning it across a part delivery produces a figure neither
 *    side agreed to, and the arithmetic for "the rest of it later" then has
 *    nowhere to put the remainder.
 *  - **The payable floors at zero.** A discount larger than a short delivery
 *    would otherwise produce a negative receivable, which reads as the
 *    business owing the customer money it does not owe. A real credit is a
 *    refund, and a refund is its own record.
 */
export function amountsOnDelivery(
  lines: readonly DispatchedLine[],
  charges: OrderCharges,
): DeliveryAmounts {
  const goods = sum(
    lines.map((line) => lineAmount(Math.max(0, Math.trunc(line.quantityDispatched)), line.unitPrice)),
  );
  const added =
    charges.deliveryCharge + charges.handlingCharge + charges.otherCharge + charges.taxAmount;
  const discount = Math.max(0, charges.discountAmount);
  const revenue = goods + added;

  return {
    goods,
    charges: added,
    discount,
    revenue,
    payable: Math.max(0, revenue - discount),
  };
}

/**
 * What is still owed after what has been collected.
 *
 * Floored at zero for the same reason: an overpayment is not a negative
 * balance, it is money to refund, and that is a different record.
 */
export function balanceAfter(payable: Pesewas, collected: Pesewas): Pesewas {
  return Math.max(0, payable - collected);
}

/**
 * The payment status a collected figure implies.
 *
 * Derived rather than set by whoever keyed the payment in, so an order cannot
 * read PAID while money is outstanding because somebody chose the wrong option
 * in a dropdown.
 */
export function paymentStatusFor(payable: Pesewas, collected: Pesewas): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (collected <= 0) return "UNPAID";
  if (collected >= payable) return "PAID";
  return "PARTIALLY_PAID";
}
