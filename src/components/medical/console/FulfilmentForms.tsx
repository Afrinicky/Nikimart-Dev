"use client";

import { Info, Truck } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, NumberInput, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import {
  dispatchSalesOrder,
  markSalesOrderDelivered,
  recordCustomerPayment,
} from "@/lib/medical/sales/fulfilment-actions";
import { formatPesewas } from "@/lib/medical/money";

/**
 * Sending a consignment out, line by line.
 *
 * Each field defaults to what is reserved rather than to what is outstanding:
 * the reserved figure is what the shelf can actually cover today, and
 * defaulting to the outstanding quantity invites somebody to submit a dispatch
 * the stock cannot support and read the refusal as a fault in the system.
 */
export function DispatchForm({
  salesOrderId,
  lines,
}: {
  salesOrderId: string;
  lines: {
    id: string;
    description: string;
    unit: string;
    outstanding: number;
    reserved: number;
    free: number | null;
  }[];
}) {
  const outstanding = lines.filter((line) => line.outstanding > 0);

  if (outstanding.length === 0) {
    return (
      <div className="medi-panel px-5 py-8 text-center">
        <p className="text-[0.8125rem] font-semibold text-medi-ink">
          Everything on this order has gone out.
        </p>
        <p className="medi-meta mt-1 text-medi-muted">
          Record the delivery when the customer confirms receipt.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={dispatchSalesOrder}
      submitLabel="Record consignment"
      pendingLabel="Recording…"
      successMessage="Consignment recorded."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="salesOrderId" value={salesOrderId} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Waybill or tracking reference"
          htmlFor="trackingNote"
          hint="What the courier gave you."
        >
          <TextInput id="trackingNote" />
        </Field>
        <Field label="Delivering to" htmlFor="deliverTo" hint="Printed on the delivery note.">
          <TextInput id="deliverTo" />
        </Field>
      </div>

      {/* See the note in ConsoleTable: `relative` keeps the visually hidden
          labels inside this scroller instead of widening the page. */}
      <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-medi-mint-50">
              <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Line item
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Outstanding
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Reserved
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Available stock
              </th>
              <th className="rounded-r-xl px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Quantity to send
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">
            {outstanding.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-3 align-top text-[0.8125rem] font-semibold text-medi-ink">
                  {line.description}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                  {line.outstanding} {line.unit}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                  {line.reserved}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem]">
                  {line.free === null ? (
                    <span className="medi-meta text-medi-muted">Not stocked</span>
                  ) : line.free >= line.outstanding ? (
                    <span className="text-medi-body">{line.free}</span>
                  ) : (
                    <span className="text-medi-warning">{line.free}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <label className="sr-only" htmlFor={`send-${line.id}`}>
                    Quantity to send for {line.description}
                  </label>
                  <input
                    id={`send-${line.id}`}
                    name={`send:${line.id}`}
                    type="number"
                    min={0}
                    max={line.outstanding}
                    defaultValue={Math.min(line.outstanding, Math.max(0, line.reserved))}
                    className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <Truck className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Stock is drawn first-expiry-first-out and the batches are recorded against each line, so a
          recall can name the customers who received a batch. Nothing is recognised as revenue until
          the delivery is confirmed.
        </span>
      </p>
    </ActionForm>
  );
}

/**
 * Confirming delivery — and the only point at which revenue is recognised.
 */
export function DeliveryForm({
  salesOrderId,
  dispatchedValue,
  partial,
}: {
  salesOrderId: string;
  /**
   * What left the building, at the order's own prices — or null for a role
   * that may confirm a delivery but not see what the order is worth. Stores is
   * exactly that role: they are holding the carton and the receivable is not
   * theirs to read.
   */
  dispatchedValue: number | null;
  /** True when some lines were never sent, so the order closes short. */
  partial: boolean;
}) {
  return (
    <ActionForm
      action={markSalesOrderDelivered}
      submitLabel="Confirm delivery"
      pendingLabel="Recording…"
      successMessage="Delivery recorded."
      className="medi-panel p-5"
    >
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <Field
        label="Note"
        htmlFor="note"
        hint="Who signed for it, or anything about the condition it arrived in."
      >
        <TextArea id="note" name="note" rows={2} />
      </Field>
      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          {dispatchedValue === null ? (
            <>This recognises the revenue for what was dispatched, not for what was ordered</>
          ) : (
            <>
              This recognises{" "}
              <span className="font-figures font-semibold">{formatPesewas(dispatchedValue)}</span>{" "}
              of revenue — what was dispatched, not what was ordered
            </>
          )}
          {partial
            ? " — and closes the order short, releasing stock still reserved against the lines that were never sent."
            : "."}{" "}
          It records no payment.
        </span>
      </p>
    </ActionForm>
  );
}

/**
 * Money arriving.
 *
 * Defaults to the outstanding balance rather than the order total, because on
 * a part-paid order the total is the wrong figure and the one most likely to be
 * submitted by accident.
 */
export function CustomerPaymentForm({
  salesOrderId,
  outstanding,
}: {
  salesOrderId: string;
  outstanding: number;
}) {
  if (outstanding <= 0) {
    return (
      <div className="medi-panel px-5 py-8 text-center">
        <p className="text-[0.8125rem] font-semibold text-medi-ink">Settled in full</p>
        <p className="medi-meta mt-1 text-medi-muted">
          Nothing is outstanding on this order. A refund is recorded separately.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={recordCustomerPayment}
      submitLabel="Record payment"
      pendingLabel="Recording…"
      successMessage="Payment recorded."
      className="medi-panel p-5"
    >
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Amount received (GH₵)"
          htmlFor="amount"
          required
          hint={`${formatPesewas(outstanding)} outstanding.`}
        >
          <NumberInput
            id="amount"
            step="0.01"
            min="0"
            required
            defaultValue={(outstanding / 100).toFixed(2)}
          />
        </Field>
        <Field label="Method" htmlFor="method">
          <Select id="method" defaultValue="BANK">
            <option value="BANK">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="MOMO">Mobile money</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field
          label="Date received"
          htmlFor="paidAt"
          hint="When the money arrived, not today."
        >
          <TextInput id="paidAt" type="date" />
        </Field>
      </div>
      <Field className="mt-4" label="Note" htmlFor="paymentNote" hint="Their payment reference.">
        <TextInput id="paymentNote" name="note" />
      </Field>
      <p className="medi-meta mt-4 text-medi-muted">
        Recorded as cash received, never as revenue — that was recognised on delivery. The two are
        separate figures and the ledger keeps them apart.
      </p>
    </ActionForm>
  );
}
