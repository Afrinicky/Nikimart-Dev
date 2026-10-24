"use client";

import { PackageCheck } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, TextInput } from "@/components/medical/console/Field";
import { recordGoodsReceipt } from "@/lib/medical/procurement/actions";

/**
 * Receiving a delivery, line by line.
 *
 * Accepted and rejected are separate boxes, deliberately. A single "received"
 * figure forces the person at the door to decide what to do about the six
 * crushed boxes before they have anywhere to write it down, and what happens
 * then is that all one hundred are marked received and the claim is never
 * made. Two boxes and a reason field make the short delivery a record instead
 * of an argument three weeks later.
 *
 * Only the accepted quantity enters stock. Rejected units are kept on the note
 * so the claim against the supplier has a number behind it, and they never
 * touch inventory.
 *
 * Batch and expiry are captured here because here is the only moment anybody
 * is holding the carton. Asked for only on lines whose product is tracked by
 * batch — a stainless steel forceps has no expiry and asking for one trains
 * people to type anything into the field.
 */
export function GoodsReceiptForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: string;
  lines: {
    id: string;
    description: string;
    ordered: number;
    alreadyAccepted: number;
    tracksBatches: boolean;
    unit: string;
  }[];
}) {
  const outstanding = lines.filter((line) => line.ordered > line.alreadyAccepted);

  if (outstanding.length === 0) {
    return (
      <div className="medi-panel px-5 py-10 text-center">
        <p className="text-[0.875rem] font-semibold text-medi-ink">
          Everything on this order has been received.
        </p>
        <p className="medi-meta mt-1 text-medi-muted">
          Record a further delivery only if the supplier ships a replacement.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      action={recordGoodsReceipt}
      submitLabel="Record delivery"
      pendingLabel="Recording…"
      successMessage="Delivery recorded. Accepted quantities are now in stock."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Their delivery note"
          htmlFor="deliveryNote"
          hint="The waybill number on the paperwork that came with it."
        >
          <TextInput id="deliveryNote" />
        </Field>
        <Field label="Notes" htmlFor="notes" hint="Anything about the condition it arrived in.">
          <TextInput id="notes" />
        </Field>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[840px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-medi-mint-50">
              <th className="rounded-l-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Line
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Outstanding
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Accepted
              </th>
              <th className="px-3 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Rejected
              </th>
              <th className="px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Batch
              </th>
              <th className="px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                Expiry
              </th>
              <th className="rounded-r-xl px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-medi-muted">
                If rejected, why
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-medi-rule">
            {outstanding.map((line) => {
              const remaining = line.ordered - line.alreadyAccepted;
              return (
                <tr key={line.id}>
                  <td className="px-3 py-3 align-top">
                    <span className="text-[0.8125rem] font-semibold text-medi-ink">
                      {line.description}
                    </span>
                    {line.alreadyAccepted > 0 ? (
                      <span className="medi-meta mt-0.5 block text-medi-muted">
                        {line.alreadyAccepted} of {line.ordered} already received
                      </span>
                    ) : null}
                  </td>
                  <td className="font-figures px-3 py-3 text-right align-top text-[0.8125rem] text-medi-body">
                    {remaining} {line.unit}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <label className="sr-only" htmlFor={`accepted-${line.id}`}>
                      Accepted quantity for {line.description}
                    </label>
                    <input
                      id={`accepted-${line.id}`}
                      name={`accepted:${line.id}`}
                      type="number"
                      min={0}
                      max={remaining}
                      defaultValue={remaining}
                      className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <label className="sr-only" htmlFor={`rejected-${line.id}`}>
                      Rejected quantity for {line.description}
                    </label>
                    <input
                      id={`rejected-${line.id}`}
                      name={`rejected:${line.id}`}
                      type="number"
                      min={0}
                      defaultValue={0}
                      className="medi-focus font-figures h-9 w-20 rounded-lg bg-white px-2 text-right text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    {line.tracksBatches ? (
                      <>
                        <label className="sr-only" htmlFor={`batch-${line.id}`}>
                          Batch number for {line.description}
                        </label>
                        <input
                          id={`batch-${line.id}`}
                          name={`batch:${line.id}`}
                          className="medi-focus h-9 w-28 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                        />
                      </>
                    ) : (
                      <span className="medi-meta text-medi-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {line.tracksBatches ? (
                      <>
                        <label className="sr-only" htmlFor={`expiry-${line.id}`}>
                          Expiry date for {line.description}
                        </label>
                        <input
                          id={`expiry-${line.id}`}
                          name={`expiry:${line.id}`}
                          type="date"
                          className="medi-focus h-9 w-36 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)]"
                        />
                      </>
                    ) : (
                      <span className="medi-meta text-medi-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <label className="sr-only" htmlFor={`reason-${line.id}`}>
                      Rejection reason for {line.description}
                    </label>
                    <input
                      id={`reason-${line.id}`}
                      name={`reason:${line.id}`}
                      placeholder="Short dated, damaged…"
                      className="medi-focus h-9 w-44 rounded-lg bg-white px-2 text-[0.8125rem] text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] placeholder:text-medi-muted"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <PackageCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Only the accepted quantity enters stock, at the order&rsquo;s landed cost. Rejected units
          stay on this note so the claim against the supplier has a figure behind it.
        </span>
      </p>
    </ActionForm>
  );
}
