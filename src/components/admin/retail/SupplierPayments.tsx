"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ExternalLink, Loader2, Plus, Receipt, ShieldAlert, Trash2, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { formatMoney } from "@/lib/format";
import {
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  methodLabel,
  paymentKindLabel,
} from "@/lib/retail/purchase-fields";
import {
  deleteSupplierPayment,
  recordSupplierPayment,
  type PurchaseState,
} from "@/lib/retail/purchase-actions";
import { cn } from "@/lib/cn";

/**
 * Every cedi sent to this supplier, and the receipt for each one.
 *
 * Rows rather than one "amount paid" field, because a supplier is rarely paid
 * once — a deposit to start the order, the balance before it ships, freight
 * on top — and each of those left on a different day through a different
 * channel with its own reference. A claim for money that bought nothing is
 * assembled out of exactly those three facts, per payment, which is why they
 * are kept apart rather than added up.
 *
 * A refund is a payment with the sign flipped: it belongs in the same list,
 * because what somebody needs to see is the whole movement of money with this
 * supplier, not the outgoings with the recoveries hidden somewhere else.
 */

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  amountGhs: number;
  method: string;
  kind: string;
  reference: string;
  receiptUrl: string;
  note: string;
  paidAt: string;
  recordedBy: string;
}

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

export function SupplierPayments({
  purchaseId,
  currency,
  fxRate,
  payments,
  outstanding,
}: {
  purchaseId: string;
  currency: string;
  fxRate: number;
  payments: PaymentRow[];
  outstanding: number;
}) {
  const [adding, setAdding] = useState(payments.length === 0);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-niki-ink">Paid to the supplier</h2>
          <p className="text-xs text-niki-ink/55">
            {payments.length === 0
              ? "Nothing recorded yet. Enter each payment as it goes out."
              : `${payments.length} payment${payments.length === 1 ? "" : "s"}${
                  outstanding > 0 ? ` · ${formatMoney(outstanding)} still owed` : " · settled in full"
                }`}
          </p>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Record a payment
          </button>
        ) : null}
      </div>

      {payments.length > 0 ? (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-niki-surface/70">
                <th className={`${th} rounded-l-xl`}>Paid</th>
                <th className={th}>For</th>
                <th className={th}>Amount</th>
                <th className={th}>How</th>
                <th className={th}>Reference</th>
                <th className={`${th} rounded-r-xl`}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                >
                  <td className={`${td} whitespace-nowrap text-xs text-niki-ink/70`}>
                    {p.paidAt}
                    {p.recordedBy ? (
                      <span className="mt-0.5 block text-[11px] text-niki-ink/40">{p.recordedBy}</span>
                    ) : null}
                  </td>
                  <td className={td}>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        p.kind === "refund"
                          ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
                          : "bg-niki-ink/5 text-niki-ink/65 ring-1 ring-niki-edge",
                      )}
                    >
                      {paymentKindLabel(p.kind)}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={cn(
                        "font-figures font-semibold",
                        p.kind === "refund" ? "text-niki-success" : "text-niki-ink",
                      )}
                    >
                      {p.kind === "refund" ? "−" : ""}
                      {formatMoney(p.amountGhs)}
                    </span>
                    {p.currency && p.currency !== "GHS" ? (
                      <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                        {p.amount.toLocaleString("en-GB")} {p.currency}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${td} text-xs text-niki-ink/70`}>{methodLabel(p.method)}</td>
                  <td className={td}>
                    <span className="font-mono text-[11px] text-niki-ink/70">
                      {p.reference || "—"}
                    </span>
                    {p.note ? (
                      <span className="mt-0.5 block max-w-[12rem] truncate text-[11px] text-niki-ink/45" title={p.note}>
                        {p.note}
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          title="Open the receipt"
                          className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-trust ring-1 ring-niki-edge hover:bg-niki-trust/10"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-niki-ink/35">none</span>
                      )}
                      <DeleteButton id={p.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {adding ? (
        <AddPayment
          purchaseId={purchaseId}
          currency={currency}
          fxRate={fxRate}
          onDone={() => setAdding(false)}
          canCancel={payments.length > 0}
        />
      ) : null}
    </section>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form action={deleteSupplierPayment}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title="Remove this payment"
        onClick={(e) => {
          if (!confirm("Remove this payment from the record?")) e.preventDefault();
        }}
        className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-danger/70 ring-1 ring-niki-edge hover:bg-niki-danger/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

function AddPayment({
  purchaseId,
  currency,
  fxRate,
  onDone,
  canCancel,
}: {
  purchaseId: string;
  currency: string;
  fxRate: number;
  onDone: () => void;
  canCancel: boolean;
}) {
  const [state, formAction] = useActionState<PurchaseState, FormData>(recordSupplierPayment, {});

  return (
    <form action={formAction} className="mt-4 rounded-2xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
      <input type="hidden" name="purchaseId" value={purchaseId} />

      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
        <Receipt className="h-3.5 w-3.5" />
        Record a payment
      </p>

      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-3 py-2.5 text-sm font-medium text-niki-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up mt-3 flex items-center gap-2 rounded-xl bg-niki-success/10 px-3 py-2.5 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Amount</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            className={cn(inputClass, "py-2 text-sm")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Currency</span>
          <input
            name="currency"
            defaultValue={currency}
            placeholder="GHS"
            className={cn(inputClass, "py-2 text-sm")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">
            What left the account
          </span>
          <input
            name="amountGhs"
            inputMode="decimal"
            placeholder="In GH₵"
            className={cn(inputClass, "py-2 text-sm")}
          />
          <span className="mt-1 block text-[11px] text-niki-ink/45">
            {fxRate > 0 ? `Blank converts at ${fxRate}.` : "Blank means the amount above."}
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Paid on</span>
          <input name="paidAt" type="date" className={cn(inputClass, "py-2 text-sm")} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">What for</span>
          <select name="kind" defaultValue="deposit" className={cn(inputClass, "py-2 text-sm")}>
            {PAYMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">How it was paid</span>
          <select name="method" defaultValue="bank" className={cn(inputClass, "py-2 text-sm")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Reference</span>
          <input
            name="reference"
            placeholder="Transfer id, MoMo reference"
            className={cn(inputClass, "py-2 text-sm")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Receipt link</span>
          <input name="receiptUrl" placeholder="https://…" className={cn(inputClass, "py-2 text-sm")} />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">Note</span>
        <input
          name="note"
          placeholder="Anything worth keeping about this payment"
          className={cn(inputClass, "py-2 text-sm")}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <Submit />
        {canCancel ? (
          <button
            type="button"
            onClick={onDone}
            className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/60 hover:bg-niki-black/5"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {pending ? "Recording…" : "Record it"}
    </button>
  );
}
