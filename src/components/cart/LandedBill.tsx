"use client";

import { Info } from "lucide-react";
import { BILL_ROWS, type AbroadCostBreakdown, type PaymentPlan } from "@/lib/abroad-costs";
import { formatPrice } from "@/lib/format";

/**
 * The bill, itemised, in the order a buyer should read it.
 *
 * A domestic order shows "subtotal + shipping" and nobody is confused. An
 * imported one has eight numbers in it, and the moment they are added up into a
 * single total the buyer is looking at a figure nobody explained. So each leg
 * is a row: the item, the tax where it was bought, the three freight legs, the
 * duty, the clearing, the Ghana tax. Rows worth nothing are dropped — a buyer
 * whose seller included the freight should not read "Freight leg 2: GH₵0.00"
 * and wonder what they missed.
 *
 * Under the goods-only plan the deferred rows are muted and labelled rather
 * than removed. What is being put off is the point of the choice; hiding it
 * would make the smaller total look like a discount.
 */
export function LandedBill({
  bill,
  plan,
  /** Hidden while a fresh quote is in flight, so stale money never shows. */
  loading = false,
}: {
  bill: AbroadCostBreakdown;
  plan: PaymentPlan;
  loading?: boolean;
}) {
  const rows = BILL_ROWS.filter(({ key }) => (bill[key] as number) > 0);
  const deferring = plan === "goods_only" && bill.deferrable > 0;

  return (
    <div>
      <dl className="space-y-2 text-sm">
        {rows.map(({ key, label, hint, deferrable }) => {
          const muted = deferring && deferrable;
          return (
            <div key={key} className="flex justify-between gap-3">
              <dt className={muted ? "text-niki-ink/40" : "text-niki-ink/70"}>
                {label}
                <span className="block text-xs text-niki-ink/40">
                  {muted ? "Due when it lands in Ghana" : hint}
                </span>
              </dt>
              <dd
                className={`shrink-0 font-medium ${muted ? "text-niki-ink/40" : "text-niki-ink"}`}
              >
                {loading ? "…" : formatPrice(bill[key] as number)}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-3 space-y-2 border-t border-niki-edge pt-3 text-sm">
        {deferring ? (
          <>
            <div className="flex justify-between font-bold text-niki-ink">
              <dt>Pay now</dt>
              <dd className="font-figures">{loading ? "…" : formatPrice(bill.goodsOnlyNow)}</dd>
            </div>
            <div className="flex justify-between text-niki-ink/60">
              <dt>Due on arrival</dt>
              <dd className="font-figures">{loading ? "…" : formatPrice(bill.deferrable)}</dd>
            </div>
            <div className="flex justify-between text-xs text-niki-ink/45">
              <dt>Estimated total</dt>
              <dd>{loading ? "…" : formatPrice(bill.total)}</dd>
            </div>
            <p className="flex gap-2 rounded-xl bg-niki-gold/10 p-3 text-xs text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Freight and duty are quoted at today&apos;s rates. Because you are settling them on
              arrival, you pay whatever they are then — they may go up or down before the item lands.
            </p>
          </>
        ) : (
          <div className="flex justify-between text-base font-bold text-niki-ink">
            <dt>Total</dt>
            <dd className="font-figures">{loading ? "…" : formatPrice(bill.total)}</dd>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The choice between settling the whole bill and settling only what is spent.
 *
 * Deliberately not a checkbox. "Pay freight later" as an opt-in tickbox hides
 * the trade — that the deferred amount is an estimate the buyer is agreeing to
 * carry — behind a word like "later". Two cards, both showing their number and
 * their consequence, make the buyer choose rather than skim.
 */
export function PaymentPlanChoice({
  bill,
  plan,
  onPlanChange,
  disabled = false,
}: {
  bill: AbroadCostBreakdown;
  plan: PaymentPlan;
  onPlanChange: (next: PaymentPlan) => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="font-display text-lg font-bold text-niki-ink">How much do you want to pay today?</h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        The goods, the tax where they are bought and the first freight leg are spent as soon as the
        seller places your order. The rest is charged when the item reaches Ghana.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PlanCard
          active={plan === "full"}
          disabled={disabled}
          onSelect={() => onPlanChange("full")}
          title="Pay in full"
          amount={bill.total}
          amountLabel="today"
          note="Nothing more to pay. Your freight and duty are locked at today's rates — if they rise before it lands, that is ours to absorb."
        />
        <PlanCard
          active={plan === "goods_only"}
          disabled={disabled}
          onSelect={() => onPlanChange("goods_only")}
          title="Pay for the goods now"
          amount={bill.goodsOnlyNow}
          amountLabel="today"
          note={`About ${formatPrice(bill.deferrable)} for freight, duty, tax and local delivery is due when it reaches Ghana — at the rates in force then.`}
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
        active
          ? "border-niki-orange bg-niki-orange/5"
          : "border-niki-edge-strong hover:bg-niki-surface"
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
