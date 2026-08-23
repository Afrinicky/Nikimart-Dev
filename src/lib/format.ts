/**
 * A negative amount reads as "−GH₵30", not "GH₵-30" — the sign belongs to the
 * number, and a minus wedged between the symbol and the digits scans as a typo.
 * Agent balances open negative, so this comes up on the very first screen a new
 * agent sees.
 */
function withSign(amount: number, body: string): string {
  return `${amount < 0 ? "−" : ""}GH₵${body}`;
}

export function formatPrice(amount: number): string {
  return withSign(
    amount,
    Math.abs(amount).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  );
}

/**
 * Money with the pesewas always shown — GH₵5.50, not GH₵5.5.
 *
 * Use this wherever prices sit next to each other in a list or a total. A
 * column that mixes "GH₵5.5" and "GH₵15.75" reads as a typo, and on a payment
 * confirmation a trailing digit that comes and goes looks like the amount
 * changed.
 */
export function formatMoney(amount: number): string {
  return withSign(
    amount,
    Math.abs(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
}

export function discountPercent(price: number, oldPrice?: number): number | null {
  if (!oldPrice || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}
