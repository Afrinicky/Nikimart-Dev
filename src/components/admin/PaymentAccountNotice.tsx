import type { AccountSplit } from "@/lib/payment-routing";

/**
 * Which Paystack account the mall is charging into.
 *
 * Three states, and the middle one is the reason this exists: a mall sharing
 * the bundle business's key takes payments perfectly well, so there is no error
 * to notice — only both businesses' money arriving in the same bank account.
 */
const COPY: Record<AccountSplit, { tone: string; title: string; detail: string }> = {
  separate: {
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    title: "Mall payments go to their own Paystack account",
    detail:
      "RETAIL_PAYSTACK_SECRET_KEY is set, so mall orders settle separately from data bundles.",
  },
  shared: {
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    title: "Mall payments are sharing the data-bundle Paystack account",
    detail:
      "Orders are charged correctly, but both businesses' money lands in one bank account. " +
      "Set RETAIL_PAYSTACK_SECRET_KEY to the mall's own Paystack secret key and redeploy.",
  },
  unconfigured: {
    tone: "border-rose-200 bg-rose-50 text-rose-900",
    title: "Mall orders are not being charged",
    detail:
      "No Paystack key is configured for the mall, so orders are marked paid without taking money. " +
      "Set RETAIL_PAYSTACK_SECRET_KEY and redeploy.",
  },
};

export function PaymentAccountNotice({ split }: { split: AccountSplit }) {
  const { tone, title, detail } = COPY[split];
  return (
    <div className={`mt-6 rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed">{detail}</p>
    </div>
  );
}
