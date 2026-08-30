import { Info } from "lucide-react";
import { formatPrice } from "@/lib/format";

/**
 * The stored bill for a placed order, itemised the way it was at checkout.
 *
 * A buyer who saw eight rows before paying and one number afterwards has no way
 * to check what they were charged for, and no reminder that a balance is coming.
 * These are the snapshotted columns off the order, not a fresh calculation:
 * rates move, and what somebody was charged must not move with them.
 *
 * Rows worth nothing are dropped, so a domestic order renders as the two-line
 * summary it has always been and only an imported one grows.
 */
export function OrderBill({
  order,
  className = "",
}: {
  order: {
    subtotal: number;
    deliveryFee: number;
    total: number;
    originTax: number;
    supplierFreight: number;
    internationalFreight: number;
    importDuty: number;
    clearingFee: number;
    ghanaTax: number;
    paymentPlan: string;
    amountPaid: number;
    balanceDue: number;
    freightLocked: boolean;
  };
  className?: string;
}) {
  const rows: { label: string; value: number }[] = [
    { label: "Items", value: order.subtotal },
    { label: "Tax at source", value: order.originTax },
    { label: "Freight leg 1 — supplier to forwarder", value: order.supplierFreight },
    { label: "Freight leg 2 — forwarder to Ghana", value: order.internationalFreight },
    { label: "Import duty", value: order.importDuty },
    { label: "Clearing & handling", value: order.clearingFee },
    { label: "Ghana VAT & levies", value: order.ghanaTax },
    { label: "Freight leg 3 — arrival point to pickup", value: order.deliveryFee },
  ].filter((r) => r.value > 0);

  const deferred = order.paymentPlan === "goods_only" && order.balanceDue > 0;

  return (
    <div className={className}>
      <dl className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 text-niki-ink/70">
            <dt>{r.label}</dt>
            <dd className="shrink-0 font-medium text-niki-ink">{formatPrice(r.value)}</dd>
          </div>
        ))}
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
              <dt>Due on arrival</dt>
              <dd className="font-figures">{formatPrice(order.balanceDue)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {deferred ? (
        <p className="mt-3 flex gap-2 rounded-xl bg-niki-gold/10 p-3 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          You chose to settle the freight, duty and local delivery when this lands in Ghana. The
          figure above is today&apos;s quote; you pay the rates in force on arrival, so it may
          change. We&apos;ll tell you the moment it reaches the country.
        </p>
      ) : order.internationalFreight > 0 || order.importDuty > 0 ? (
        <p className="mt-3 text-xs text-niki-ink/50">
          Paid in full — your freight and duty are locked at the rates quoted when you ordered.
        </p>
      ) : null}
    </div>
  );
}
