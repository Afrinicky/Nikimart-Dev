"use client";

import { Info } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { CartBill, PaymentPlan } from "@/lib/cart-bill";

/**
 * The bill: what the goods cost, and what it costs to put them in your hands.
 *
 * It used to be eight rows — item, tax at source, three freight legs, duty,
 * clearing, Ghana VAT — on the theory that a buyer who can see every component
 * can check the total. In practice they cannot: nobody can audit an import
 * duty, and a screen of numbers a buyer has no way to verify does not read as
 * transparency, it reads as a list of things being charged for. Worse, the tax
 * rows made the platform's cost structure a public document.
 *
 * So: two numbers. Everything that is not the goods is inside the shipping
 * figure, and it is the same figure whichever way it was arrived at — a courier
 * run across Kumasi, or a sea container plus the customs bill behind it. The
 * components are still computed, still charged, still on the order for the
 * admin console and the finance reports. They are simply not a buyer's problem.
 */
export function CheckoutBill({
  bill,
  plan,
  /** Hidden while a fresh quote is in flight, so stale money never shows. */
  loading = false,
}: {
  bill: CartBill;
  plan: PaymentPlan;
  loading?: boolean;
}) {
  const deferring = plan === "shipping_on_pickup" && bill.deferrable > 0;
  const amount = (n: number) => (loading ? "…" : formatPrice(n));

  return (
    <div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-niki-ink/70">Items</dt>
          <dd className="shrink-0 font-medium text-niki-ink">{amount(bill.goods)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={deferring ? "text-niki-ink/40" : "text-niki-ink/70"}>
            Shipping
            <span className="block text-xs text-niki-ink/40">
              {deferring
                ? "Paid when you collect"
                : bill.shipping === 0
                  ? "Already at your pickup station"
                  : "To the station you chose"}
            </span>
          </dt>
          <dd
            className={`shrink-0 font-medium ${deferring ? "text-niki-ink/40" : "text-niki-ink"}`}
          >
            {bill.shipping === 0 && !loading ? (
              <span className="text-niki-success">Free</span>
            ) : (
              amount(bill.shipping)
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2 border-t border-niki-edge pt-3 text-sm">
        {deferring ? (
          <>
            <div className="flex justify-between font-bold text-niki-ink">
              <dt>Pay now</dt>
              <dd className="font-figures">{amount(bill.goodsOnlyNow)}</dd>
            </div>
            <div className="flex justify-between text-niki-ink/60">
              <dt>Pay at collection</dt>
              <dd className="font-figures">{amount(bill.deferrable)}</dd>
            </div>
            <p className="flex gap-2 rounded-xl bg-niki-gold/10 p-3 text-xs text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your items are paid for today. The shipping is quoted at today&apos;s rates and settled
              at the station — if rates move before your order lands, you pay what they are then.
            </p>
          </>
        ) : (
          <div className="flex justify-between text-base font-bold text-niki-ink">
            <dt>Total</dt>
            <dd className="font-figures">{amount(bill.total)}</dd>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The choice between paying everything now and settling the shipping later.
 *
 * Deliberately not a checkbox. "Pay shipping later" as an opt-in tickbox hides
 * the trade — that the deferred amount is a quote the buyer is agreeing to
 * carry — behind a word. Two cards, both showing their number and its
 * consequence, make the buyer choose rather than skim.
 *
 * The goods never appear in this choice. They are paid in full at checkout,
 * because that is money the seller spends the moment they fulfil the order.
 */
export function PaymentPlanChoice({
  bill,
  plan,
  onPlanChange,
  disabled = false,
}: {
  bill: CartBill;
  plan: PaymentPlan;
  onPlanChange: (next: PaymentPlan) => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="font-display text-lg font-bold text-niki-ink">When do you want to pay the shipping?</h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        Your items are paid for today either way. The sellers on this order are happy for the
        shipping to wait until you are at the pickup station.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PlanCard
          active={plan === "full"}
          disabled={disabled}
          onSelect={() => onPlanChange("full")}
          title="Pay it all now"
          amount={bill.total}
          amountLabel="today"
          note="Nothing to pay at the station. Your shipping is locked at today's rate — if it rises before your order lands, that is ours to absorb."
        />
        <PlanCard
          active={plan === "shipping_on_pickup"}
          disabled={disabled}
          onSelect={() => onPlanChange("shipping_on_pickup")}
          title="Pay shipping at collection"
          amount={bill.goodsOnlyNow}
          amountLabel="today"
          note={`About ${formatPrice(bill.deferrable)} for shipping is due when you collect — at the rate in force then.`}
        />
      </div>
    </section>
  );
}

function PlanCard({
  active,
  disabled,
  onSelect,
  title,
  amount,
  amountLabel,
  note,
}: {
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  amount: number;
  amountLabel: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? "border-niki-orange bg-niki-orange/5" : "border-niki-edge-strong hover:bg-niki-surface"
      }`}
    >
      <span className="block text-sm font-semibold text-niki-ink">{title}</span>
      <span className="mt-1 block font-figures text-xl font-bold text-niki-ink">
        {formatPrice(amount)}
        <span className="ml-1 text-xs font-medium text-niki-ink/50">{amountLabel}</span>
      </span>
      <span className="mt-2 block text-xs leading-relaxed text-niki-ink/60">{note}</span>
    </button>
  );
}
