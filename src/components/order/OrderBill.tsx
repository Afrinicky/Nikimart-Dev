import { Info } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { isDeferredPlan } from "@/lib/cart-bill";

/**
 * The stored bill for a placed order, as the buyer saw it at checkout.
 *
 * Two rows, because two rows is what they agreed to. The freight legs, the
 * duty, the clearing and the taxes are all snapshotted on the order for the
 * admin console and the finance reports; showing them back to the buyer would
 * itemise a customs bill nobody can audit and answer a question they never
 * asked.
 *
 * These are the snapshotted columns, not a fresh calculation: rates move, and
 * what somebody was charged must not move with them.
 */
export function OrderBill({
  order,
  className = "",
}: {
  order: {
    subtotal: number;
    deliveryFee: number;
    total: number;
    paymentPlan: string;
    amountPaid: number;
    balanceDue: number;
    freightLocked: boolean;
  };
  className?: string;
}) {
  const deferred = isDeferredPlan(order.paymentPlan) && order.balanceDue > 0;

  return (
    <div className={className}>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3 text-niki-ink/70">
          <dt>Items</dt>
          <dd className="shrink-0 font-medium text-niki-ink">{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-niki-ink/70">
          <dt>Shipping</dt>
          <dd className="shrink-0 font-medium text-niki-ink">
            {order.deliveryFee === 0 ? (
              <span className="text-niki-success">Free</span>
            ) : (
              formatPrice(order.deliveryFee)
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-niki-edge pt-2 font-figures font-bold text-niki-ink">
          <dt>Total</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
        {deferred ? (
          <>
            <div className="flex justify-between gap-3 text-niki-ink/70">
              <dt>Paid</dt>
              <dd className="font-medium text-niki-ink">{formatPrice(order.amountPaid)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold text-niki-orange">
              <dt>Due at collection</dt>
              <dd className="font-figures">{formatPrice(order.balanceDue)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {deferred ? (
        <p className="mt-3 flex gap-2 rounded-xl bg-niki-gold/10 p-3 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Your items are paid for. You chose to settle the shipping when you collect — the figure
          above is the quote from the day you ordered, and you pay the rate in force when it
          arrives, so it may change. We&apos;ll tell you the moment it is ready.
        </p>
      ) : order.deliveryFee > 0 ? (
        <p className="mt-3 text-xs text-niki-ink/50">
          Paid in full — your shipping is locked at the rate quoted when you ordered.
        </p>
      ) : null}
    </div>
  );
}
