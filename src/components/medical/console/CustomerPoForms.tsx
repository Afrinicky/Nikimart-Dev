"use client";

import { ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, TextArea } from "@/components/medical/console/Field";
import {
  acceptCustomerPurchaseOrder,
  rejectCustomerPurchaseOrder,
} from "@/lib/medical/sales/customer-po-actions";
import { formatPesewas } from "@/lib/medical/money";

/**
 * Accepting a customer purchase order, line item by line item.
 *
 * A quantity field per line rather than a single button, because an institution
 * routinely orders three of the five line items quoted, or forty of the hundred
 * units on one of them. Acceptance at document level cannot express that, and
 * the cost of pretending otherwise is a delivery the institution did not order
 * and will not pay for.
 *
 * The prices shown are the quoted prices and are not editable here. Where a
 * customer's purchase order disagrees with the quotation, that is a matter to
 * resolve with the customer, not a figure to amend on our side.
 */
export function AcceptCustomerPoForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: string;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    free: number | null;
  }[];
}) {
  return (
    <ActionForm
      action={acceptCustomerPurchaseOrder}
      submitLabel="Accept and create sales order"
      pendingLabel="Accepting…"
      successMessage="Accepted."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />

      <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-medi-mint-50">
              <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Line
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Quantity ordered
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Unit price
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Available stock
              </th>
              <th className="rounded-r-xl px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Quantity accepted
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-3 align-top">
                  <span className="text-[0.8125rem] font-semibold text-medi-ink">
                    {line.description}
                  </span>
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                  {line.quantity} {line.unit}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                  {formatPesewas(line.unitPrice)}
                </td>
                <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem]">
                  {line.free === null ? (
                    <span className="medi-meta text-medi-muted">Not stocked</span>
                  ) : line.free >= line.quantity ? (
                    <span className="text-medi-body">{line.free}</span>
                  ) : (
                    <span className="text-medi-warning">{line.free}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <label className="sr-only" htmlFor={`accept-${line.id}`}>
                    Quantity to accept for {line.description}
                  </label>
                  <input
                    id={`accept-${line.id}`}
                    name={`accept:${line.id}`}
                    type="number"
                    min={0}
                    max={line.quantity}
                    defaultValue={line.quantity}
                    className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <ShieldCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Acceptance creates a sales order and reserves whatever stock can cover it. It does not
          dispatch anything and it does not record a payment. Line items stock cannot cover are
          accepted regardless — the shortfall becomes a sourcing request.
        </span>
      </p>
    </ActionForm>
  );
}

/** Reject a purchase order, with a reason that is given to the customer. */
export function RejectCustomerPoForm({ purchaseOrderId }: { purchaseOrderId: string }) {
  return (
    <ActionForm
      action={rejectCustomerPurchaseOrder}
      submitLabel="Reject purchase order"
      pendingLabel="Rejecting…"
      variant="danger"
      successMessage="Rejected. The reason has been recorded."
      className="medi-panel p-5"
    >
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <Field
        label="Reason for rejection"
        htmlFor="reason"
        hint="Recorded against the purchase order and communicated to the customer."
      >
        <TextArea
          id="reason"
          required
          placeholder="Prices differ from quotation QT-0042. Awaiting a corrected purchase order."
        />
      </Field>
    </ActionForm>
  );
}
